// Trust-boundary safety for the shared backlog repository mode.
// Cited source: the pinned oracle at commit ec5b254e — (url_repo_id),
// 77-100 (ensure_home checks), 188-193 (_git), 587-595 (phase_by_ident);
// (_slugify). The item adds two checks with no oracle line:
// an absolute path (own message, before any git call) and a symlink check that
// reuses safePath (src/storage.js:8-17).
import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { safePath } from '../storage.js';

// owner/name from a git URL or path: https://host/Owner/name(.git),
// git@host:Owner/name(.git), /srv/Owner/name.git. The last two parts win, so a
// token in the URL changes nothing; fewer than two parts -> "". The setting's value
// and the clone's origin are parsed by this one function, so the two
// sides of the origin check compare the same way.
export function repoIdFromUrl(url) {
  // user-info (user:token@) is stripped here, at the one place origins are parsed: no identity, log or error carries it
  let u = String(url ?? '').trim().replace(/\/+$/, '').replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1').replace(/^[^/\\:@]*:[^/\\@]*@/, '');
  if (u.endsWith('.git')) u = u.slice(0, -4);
  // Also splits on \ (beyond the earlier scripts) so a Windows local-path origin (C:\srv\Owner\name.git) works.
  const parts = u.split(/[/\\:]/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : '';
}

// Validate a backlog repository clone:
// in the order the item fixes: absolute (item), exists (77-80, the path-naming
// message), top folder of a git repository (92-94, compared after resolving
// symlinks like Python's Path.resolve), no symlink on the path (item, via
// safePath), the expected owner/name case-insensitive (95-97), branch main
// (98-100). expected is the shared backlog repository's owner/name and
// defaultHome its default home - the CLI carries no built-in name:
// both come from the caller's setting. Returns the home path with its parent
// resolved or throws the message.
// native: expands Windows 8.3 short names (RUNNER~1) the way git reports them;
// Windows paths compare case-insensitively.
const realPath = p => { const r = realpathSync.native(p); return process.platform === 'win32' ? r.toLowerCase() : r; };

// setting is the configured clone URL; when given, the origin-mismatch
// error names it, so the failure points at the value that was checked.
export async function validateHome(path, expected, defaultHome, setting) {
  if (!isAbsolute(path)) throw new Error(`${path} is not an absolute path; use the absolute path to a clone of ${expected}`);
  if (!existsSync(path)) throw new Error(`SMOOTH_BACKLOG_CLI_HOME=${path} does not exist; expected a clone of ${expected} on main (unset SMOOTH_BACKLOG_CLI_HOME to use ${defaultHome})`);
  const top = (await git(['rev-parse', '--show-toplevel'], path)).stdout.trim();
  if (!top || realPath(top) !== realPath(path)) throw new Error(`${path} is not the top folder of a git repository; expected a clone of ${expected} on main`);
  // Symlinks above the home (macOS /var, a linked ~) are not attacker-controlled: resolve the parent, refuse a link at the home itself.
  const parent = realpathSync(dirname(resolve(path)));
  const home = join(parent, basename(path));
  await safePath(parent, home);
  const origin = repoIdFromUrl((await git(['remote', 'get-url', 'origin'], path)).stdout);
  // A missing origin is a refusal: the empty id of a clone without an origin must not compare equal to an empty expected id
  if (!origin || origin.toLowerCase() !== String(expected).toLowerCase())
    throw new Error(`${path} has origin '${origin || 'none'}'; expected ${expected}${setting ? ` (the setting is '${setting}')` : ''}`);
  const branch = (await git(['branch', '--show-current'], path)).stdout.trim();
  if (branch !== 'main') throw new Error(`${path} is on branch '${branch || 'detached HEAD'}'; the backlog repository stays on main`);
  return home; // the resolved path, as records it
}

// The item name slug: lowercase, runs of non-alphanumerics
// to one dash, dash-trimmed, "phase" when nothing is left. Never contains / or..
// because no other character class survives.
export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/, '') || 'phase';
}

// A phase by its NUMBER (the NNN of its file name) or by its slug — never by the
// row id. Digits select by number, anything else
// selects by slug, an empty/absent selector selects nothing.
export function itemSelector(text) {
  if (text === null || text === undefined) return null;
  const ident = String(text).trim();
  if (ident === '') return null;
  if (/^\d+$/.test(ident)) return { number: Number.parseInt(ident, 10) };
  return { slug: ident };
}

// Assert that path lives inside root (no.. escape, no symlink component on the
// way down) and return the relative path. The check is safePath
// (src/storage.js:8-17), the repository's standing path device.
export async function assertInside(root, path) {
  await safePath(root, path);
  return relative(resolve(root), resolve(path));
}

// Review refs are relative paths into the coding-model repository: each must be
// non-empty, relative, and free of '..' components. An absolute or..-crossing
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

// Strip the credential from URLs so that it never reaches the text that is shown. In a scheme://
// URL the complete user-info goes (everything between '://' and the last '@' of the authority, any
// characters); without a scheme only a user:token@ of word-like characters (git:tok@host) goes. A
// colon-less user@host without a scheme (scp-style git@github.com:o/r) and plain text stay intact.
export function redact(text) {
  return String(text).replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi, '$1').replace(/\b[\w.-]+:[\w.~+/%-]+@/g, '');
}

// Run git with an argv array — never a shell — with
// GIT_TERMINAL_PROMPT=0 so a git subprocess can never prompt on a terminal.
// Resolves {stdout, stderr, code}; a failed or unspawable run has code != 0.
export function git(args, cwd, config = {}) { // config: git settings for this run only, through GIT_CONFIG_* (argv stays as the caller wrote it)
  const keys = Object.entries(config);
  const n = Number(process.env.GIT_CONFIG_COUNT) || 0;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(keys.length ? { GIT_CONFIG_COUNT: String(n + keys.length) } : {}) };
  keys.forEach(([k, v], i) => { env[`GIT_CONFIG_KEY_${n + i}`] = k; env[`GIT_CONFIG_VALUE_${n + i}`] = v; });
  return new Promise((done) => {
    execFile('git', args, { cwd, env, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        done({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code });
      });
  });
}
