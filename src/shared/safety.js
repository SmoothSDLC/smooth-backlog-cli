// Trust-boundary safety for the shared backlog repository mode (cli-parity job 3).
// Cited source: the pinned oracle at commit ec5b254e — lib_db.py:58-64 (url_repo_id),
// 77-100 (ensure_home checks), 188-193 (_git), 587-595 (phase_by_ident);
// new_phase.py:19-20 (_slugify). The item adds two checks with no oracle line:
// an absolute path (own message, before any git call) and a symlink check that
// reuses safePath (src/storage.js:8-17).
import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { safePath } from '../storage.js';

const BACKLOG_ORIGIN = 'SmoothSDLC/smoothsdlc-backlog'; // lib_db.py:34
const DEFAULT_HOME = '~/git/smoothsdlc-backlog'; // lib_db.py:36

// owner/name from a git URL or path (lib_db.py:58-64): https://host/Owner/name(.git),
// git@host:Owner/name(.git), /srv/Owner/name.git. The last two parts win, so a
// token in the URL changes nothing; fewer than two parts -> "".
export function repoIdFromUrl(url) {
  let u = String(url ?? '').trim().replace(/\/+$/, '');
  if (u.endsWith('.git')) u = u.slice(0, -4);
  const parts = u.split(/[/:]/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : '';
}

// Validate a shared-mode home exactly as the oracle's checks (lib_db.py:77-100),
// in the order the item fixes: absolute (item), exists (77-80, the path-naming
// message), top folder of a git repository (92-94, compared after resolving
// symlinks like Python's Path.resolve()), no symlink on the path (item, via
// safePath), origin SmoothSDLC/smoothsdlc-backlog case-insensitive (95-97),
// branch main (98-100). Returns the resolved home path or throws the message.
export async function validateHome(path) {
  if (!isAbsolute(path)) throw new Error(`${path} is not an absolute path; use the absolute path to a clone of ${BACKLOG_ORIGIN}`);
  if (!existsSync(path)) throw new Error(`BACKLOG_HOME=${path} does not exist; expected a clone of ${BACKLOG_ORIGIN} on main (unset BACKLOG_HOME to use ${DEFAULT_HOME})`);
  const top = (await git(['rev-parse', '--show-toplevel'], path)).stdout.trim();
  if (!top || realpathSync(top) !== realpathSync(path)) throw new Error(`${path} is not the top folder of a git repository; expected a clone of ${BACKLOG_ORIGIN} on main`);
  await safePath('/', path);
  const origin = repoIdFromUrl((await git(['remote', 'get-url', 'origin'], path)).stdout);
  if (origin.toLowerCase() !== BACKLOG_ORIGIN.toLowerCase()) throw new Error(`${path} has origin '${origin || 'none'}'; expected ${BACKLOG_ORIGIN}`);
  const branch = (await git(['branch', '--show-current'], path)).stdout.trim();
  if (branch !== 'main') throw new Error(`${path} is on branch '${branch || 'detached HEAD'}'; the backlog repository stays on main`);
  return resolve(path);
}

// The item name slug (new_phase.py:19-20): lowercase, runs of non-alphanumerics
// to one dash, dash-trimmed, "phase" when nothing is left. Never contains / or ..
// because no other character class survives.
export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/, '') || 'phase';
}

// A phase by its NUMBER (the NNN of its file name) or by its slug — never by the
// database row id (lib_db.py:587-595). Digits select by number, anything else
// selects by slug, an empty/absent selector selects nothing.
export function itemSelector(text) {
  if (text === null || text === undefined) return null;
  const ident = String(text).trim();
  if (ident === '') return null;
  if (/^\d+$/.test(ident)) return { number: Number.parseInt(ident, 10) };
  return { slug: ident };
}

// Assert that path lives inside root (no .. escape, no symlink component on the
// way down) and return the relative path. The check is safePath
// (src/storage.js:8-17), the repository's standing path device.
export async function assertInside(root, path) {
  await safePath(root, path);
  return relative(resolve(root), resolve(path));
}

// Review refs are relative paths into the coding-model repository: each must be
// non-empty, relative, and free of '..' components. An absolute or ..-crossing
// ref would let a file name pick where it is resolved.
export function checkRefs(refs) {
  if (!Array.isArray(refs)) throw new Error(`review refs must be a list of paths, got ${typeof refs}`);
  for (const ref of refs) {
    const r = String(ref);
    if (r === '') throw new Error('an empty review ref is not allowed');
    if (isAbsolute(r)) throw new Error(`review ref '${r}' is absolute; expected a relative path`);
    if (r.split('/').some(p => p === '..')) throw new Error(`review ref '${r}' contains '..'`);
  }
}

// Strip the user:token@ userinfo from URLs so that a credential in a git URL
// never reaches the text that is shown. The whole userinfo goes (the item:
// "strip user:token@"); a colon-less userinfo (git@host:) and plain text are
// left intact. ponytail: one regex; a userinfo with two colons (rare) is only
// stripped from its last component.
export function redact(text) {
  return String(text).replace(/\b[\w.-]+:[\w.~+/%-]+@/g, '');
}

// Run git with an argv array — never a shell (pattern lib_db.py:188-193) — with
// GIT_TERMINAL_PROMPT=0 so a git subprocess can never prompt on a terminal.
// Resolves {stdout, stderr, code}; a failed or unspawable run has code != 0.
export function git(args, cwd) {
  return new Promise((done) => {
    execFile('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        done({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code });
      });
  });
}
