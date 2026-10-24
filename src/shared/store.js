// Shared store for the shared backlog repository mode (cli-parity job 5): reads and
// writes the Python skill's item files in <home>/<owner>/<name>. Cited source: the pinned
// oracle at ec5b254e (contract v3). It never clones, commits or pushes (sync is job 8).
// The surface is synchronous (spawnSync, tmp + rename) so sync and async callers can use it.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { operation } from '../errors.js';
import { locked } from '../storage.js';
import { dump, hasFrontMatter, parse } from './frontmatter.js';
import { repoIdFromUrl } from './safety.js';
import { outsideTeam } from './team.js';

const BACKLOG_ORIGIN = 'SmoothSDLC/smoothsdlc-backlog'; // lib_db.py:34
const ACTIONABLE = ['pending', 'in_progress'];          // lib_db.py:515

const expand = p => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p);
const configDir = () => process.env.XDG_CONFIG_HOME || join(homedir(), '.config'); // lib_db.py:45

// lib_db.py:49-55 and 81-85. A missing home is returned tagged (ask.code 4), never cloned;
// the caller prints ask.text and exits with ask.code.
export function resolveHome() {
  let home = process.env.BACKLOG_HOME;
  if (!home) {
    try { home = readFileSync(join(configDir(), 'smoothsdlc-backlog', 'home'), 'utf8').trim(); } catch { /* no record */ }
  }
  home = resolve(expand(home || '~/git/smoothsdlc-backlog'));
  // Symlinks above the home (macOS /var, a linked ~) are resolved once here; a link AT the home is kept for validateHome to refuse.
  if (existsSync(home)) return { home: join(realpathSync(dirname(home)), basename(home)), ask: null };
  const sh = join(process.env.SMOOTH_BACKLOG_SCRIPTS || join(homedir(), 'git', 'smoothsdlc-backlog', 'skill', 'backlog', 'scripts'), 'set_home.py');
  return {
    home,
    ask: {
      code: 4,
      text: `the backlog repository is not at ${home}. ASK THE USER: where is the local clone of ${BACKLOG_ORIGIN}, `
        + `or should it be cloned to ${home}? Then run 'python3 ${sh} <path>' (existing clone) or `
        + `'python3 ${sh} --clone [<path>]', and run this command again.`,
    },
  };
}

// Contract section 1: $XDG_CONFIG_HOME/smooth-backlog-cli/mode.json, one JSON object; absent means local.
const modeFile = () => join(configDir(), 'smooth-backlog-cli', 'mode.json');

export function getMode() {
  try { return JSON.parse(readFileSync(modeFile(), 'utf8')).mode === 'shared' ? 'shared' : 'local'; } catch { return 'local'; }
}

export function setMode(mode) {
  if (mode !== 'shared' && mode !== 'local') throw new Error(`mode must be 'shared' or 'local', got ${JSON.stringify(mode)}`);
  atomicWrite(modeFile(), JSON.stringify({ mode }));
}

// lib_db.py:142-144: <home>/<owner>/<name>. Each part must be a plain name: no separators, no . or ..
export function folder(home, repoId) {
  const parts = String(repoId).split('/');
  if (parts.length !== 2 || parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) throw new Error(`not an owner/name repository id: ${repoId}`);
  return join(resolve(home), ...parts);
}

// The one operation lock of the clone: every command that can pull, write item files or touch backlog.db (reads that pull included) holds it
// from before its pull to after its push, whatever repository folders it works on. Re-entrant in the process (query --pop runs pop), and for
// a child its holder runs and waits for, which is given lockEnv(home) (pop --claim-now runs update).
const held = new Set();
const lockPath = home => join(home, '.git', 'smooth-backlog-cli-run.lock');
export const lockEnv = home => ({ BACKLOG_RUN_LOCK_HELD: `${lockPath(home)}:${process.pid}` });
export function cloneLocked(home, fn) {
  const path = lockPath(home);
  if (held.has(path) || process.env.BACKLOG_RUN_LOCK_HELD === `${path}:${process.ppid}`) return fn();
  // a normal update (pull, write, push over the network) can take a while: a command behind it waits, 120 s unless BACKLOG_LOCK_WAIT_MS says otherwise
  return locked(path, async () => {
    held.add(path);
    recoverJournal(home); // a killed predecessor's half-done change goes first
    try { return await fn(); } finally { held.delete(path); }
  }, { wait: Number(process.env.BACKLOG_LOCK_WAIT_MS) > 0 ? Number(process.env.BACKLOG_LOCK_WAIT_MS) : 120000, takeOver: true });
}

function git(args, cwd) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { stdout: String(p.stdout || ''), code: p.status ?? 1 };
}

// lib_db.py:122-135: owner/name from the origin; a worktree shares its main tree's remotes.
export function repoId(cwd) {
  if (git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).code) throw new Error('run this from inside a git repository (the repository whose backlog you want)');
  const id = repoIdFromUrl(git(['remote', 'get-url', 'origin'], cwd).stdout);
  if (!id) throw new Error("this repository has no remote 'origin'. Add it first (git remote add origin <url>): the backlog is keyed by the repository's owner/name");
  return id;
}

// lib_db.py:273-277
export function branch(cwd) {
  const b = git(['branch', '--show-current'], cwd).stdout.trim();
  if (!b) throw new Error('HEAD is detached; check out the branch the item belongs to first');
  return b;
}

function atomicWrite(path, text) { // the semantics of src/storage.js atomicWrite, synchronous
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
    renameSync(temp, path);
  } finally { rmSync(temp, { force: true }); }
}

// src/storage.js safePath, synchronously: target lies inside root and no component below root is a symlink.
// shortcut: check-then-write, so a symlink swapped in between is not caught; fine for a single-user clone.
export function assertNoSymlinks(root, target) {
  const rel = relative(resolve(root), resolve(target));
  operation(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `Unsafe path: ${target}.`);
  let current = resolve(root);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    let link;
    try { link = lstatSync(current).isSymbolicLink(); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    operation(!link, `Symlink destination is unsupported: ${current}. Resolve it before using backlog.`);
  }
}

// The repository folder is <home>/<owner>/<name>: the owner and the name are checked from the trusted home (two levels up),
// so a link at either is refused before anything is read or written through it.
export const assertFolder = dir => assertNoSymlinks(dirname(dirname(resolve(dir))), dir);

// lib_db.py:182-184. item.path is absolute (the caller joins the folder and the load-relative path).
// root is the repository folder; without it, the folder is what precedes the first phases/ or archive/ segment.
// The paths a command writes, renames or removes, with their content before (null: absent): db.undoOnThrow puts back exactly these.
// Whoever changes an item file calls note(path) first; write() does.
const journals = [];
export const journalled = fn => { const j = new Map(); journals.push(j); return fn(j).finally(() => journals.pop()); };

// The recovery journal: the same priors, on disk (fsynced) before each write, for the outermost undoOnThrow only. A process killed inside that
// window (no catch runs) leaves it behind; the next command that takes the clone lock rolls it back first (recoverJournal). It lives in .git:
// git never sees it. persist = {home, files: Map<path, base64 | null>, folders: Set}.
let persist = null;
const journalFile = home => join(home, '.git', 'smooth-backlog-cli-journal.json');
function saveJournal() {
  const tmp = `${journalFile(persist.home)}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try { writeSync(fd, JSON.stringify({ files: Object.fromEntries(persist.files), folders: [...persist.folders] })); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, journalFile(persist.home));
}
export function beginJournal(folder) { // true when this call opened the journal (the outermost undo); it also covers `folder`
  const home = dirname(dirname(resolve(folder)));
  if (!persist && existsSync(join(home, '.git'))) { persist = { home, files: new Map(), folders: new Set() }; var opened = true; }
  if (persist) { persist.folders.add(resolve(folder)); persistNote(join(resolve(folder), 'backlog.db')); }
  return Boolean(opened);
}
export function endJournal() { const p = persist; persist = null; if (p) rmSync(journalFile(p.home), { force: true }); }
function persistNote(path, prior) {
  if (!persist || persist.files.has(path)) return;
  const bytes = prior !== undefined ? prior : existsSync(path) ? readFileSync(path) : null;
  persist.files.set(path, bytes === null ? null : Buffer.from(bytes).toString('base64'));
  saveJournal();
}
export function note(path, prior) {
  const j = journals.at(-1);
  if (j && !j.has(path)) j.set(path, prior !== undefined ? prior : existsSync(path) ? readFileSync(path) : null);
  persistNote(path, prior);
}

// Rolls back what a killed command left (see above): every path to its prior bytes or absence, the mirror db file included, and the git index
// of the folders unstaged. Runs under the clone lock, before anything else.
export function recoverJournal(home) {
  const file = journalFile(home);
  if (!existsSync(file)) return;
  let rec;
  try { rec = JSON.parse(readFileSync(file, 'utf8')); } catch { rmSync(file, { force: true }); return; } // a torn write: nothing was changed yet
  const root = resolve(home) + sep;
  for (const [path, b64] of Object.entries(rec.files)) {
    if (!resolve(path).startsWith(root)) continue; // never write outside the clone, whatever the file says
    if (path.endsWith('backlog.db')) for (const s of ['-journal', '-wal', '-shm']) rmSync(path + s, { force: true });
    if (b64 === null) rmSync(path, { force: true }); else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(b64, 'base64')); }
  }
  for (const folder of rec.folders ?? []) if (resolve(folder).startsWith(root)) git(['reset', '-q', '--', '.'], folder);
  rmSync(file, { force: true });
  process.stderr.write(`backlog: rolled back a command that was killed half-way (${Object.keys(rec.files).length} path(s) restored in ${home})\n`);
}

export function write(item, root) {
  const inferred = /^(.*?)[/\\](?:phases|archive)[/\\]/.exec(item.path)?.[1];
  const base = root ?? (inferred || dirname(item.path));
  assertFolder(base);
  assertNoSymlinks(base, item.path);
  note(item.path);
  atomicWrite(item.path, dump(item.fm, item.body));
}

// lib_db.py:482-503: phases/*.md, then archive/**/*.md. path is folder-relative with '/'.
// The phases/*.md files without a front matter block: left alone by every command, reported by query.
export function bareFiles(dir) {
  assertFolder(dir);
  let names;
  try { names = readdirSync(join(dir, 'phases')).filter(n => n.endsWith('.md')).sort(); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return names.filter(n => !hasFrontMatter(readFileSync(join(dir, 'phases', n), 'utf8'))).map(n => `phases/${n}`);
}

export function load(dir) {
  assertFolder(dir);
  const items = [];
  const walk = (rel, deep) => {
    assertNoSymlinks(dir, join(dir, rel));
    let entries;
    try { entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    for (const e of entries) {
      const path = `${rel}/${e.name}`;
      if (e.isSymbolicLink()) assertNoSymlinks(dir, join(dir, path));
      if (e.isDirectory() && deep) walk(path, deep);
      else if (e.isFile() && e.name.endsWith('.md')) {
        const text = readFileSync(join(dir, path), 'utf8');
        const sha256 = createHash('sha256').update(text).digest('hex'); // lib_db.py:163-164
        if (rel === 'phases' && !hasFrontMatter(text)) continue; // a README or a stray note in phases/ is not an item: ranking it would rewrite it as an empty one (see bareFiles)
        items.push({ path, ...parse(text), sha256, sha: sha256 });
      }
    }
  };
  walk('phases', false);
  walk('archive', true);
  return items;
}

// The mirror database <dir>/backlog.db, opened read-only (never modified): fn(db) when it has a phase table, else null.
function withMirror(dir, fn) {
  const dbFile = join(dir, 'backlog.db');
  if (!existsSync(dbFile)) return null;
  // node:sqlite prints an ExperimentalWarning on some Node 24 builds: keep it off stderr.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => { if (!/sqlite/i.test(String(w))) emit.call(process, w, ...a); };
  let sqlite;
  try { sqlite = process.getBuiltinModule('node:sqlite'); } finally { process.emitWarning = emit; }
  const db = new sqlite.DatabaseSync(dbFile, { readOnly: true });
  try {
    return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='phase'").get() ? fn(db) : null;
  } finally { db.close(); }
}

// new_phase.py:23-25 with contract section 3: 1 + max(seq of phases/ and archive/, MAX(seq) of backlog.db).
export function nextSeq(dir) {
  const max = Math.max(0, ...load(dir).map(i => Number(i.fm.seq) || 0));
  return Math.max(max, withMirror(dir, db => Number(db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM phase').get().m)) ?? 0) + 1;
}

const slugOf = i => i.fm.phase || basename(i.path, '.md'); // lib_db.py:ingest_phase slug

// lib_db.py:523-530: pending/in_progress items of phases/ (all branches), priority then seq. The oracle ranks mirror rows: a ghost
// (an actionable row whose file is gone) keeps its rank and is counted, but has no file to rewrite.
// Absent keys read as the mirror database defaults (status pending, priority 50, seq 0); an explicit null stays null.
const statusOf = i => (Object.hasOwn(i.fm, 'status') ? i.fm.status : 'pending');
function actionable(dir) {
  const items = load(dir);
  const live = items.filter(i => i.path.startsWith('phases/'));
  const files = live.filter(i => ACTIONABLE.includes(statusOf(i)));
  const slugs = new Set(live.map(slugOf)); // a file moved to archive/ outside the CLI leaves its row unchanged: still ranked
  const ghosts = withMirror(dir, db => db.prepare("SELECT slug, seq, priority, path FROM phase WHERE status IN ('pending', 'in_progress') AND handoff_id = (SELECT id FROM handoff WHERE status = 'active' LIMIT 1)").all()
    .filter(r => !slugs.has(r.slug) && !existsSync(join(dir, String(r.path ?? '')))).map(r => ({ ghost: true, path: r.path, fm: { phase: r.slug, seq: r.seq, priority: r.priority } }))) ?? [];
  return [...files, ...ghosts].sort((a, b) => ((a.fm.priority ?? 50) - (b.fm.priority ?? 50)) || ((a.fm.seq ?? 0) - (b.fm.seq ?? 0)));
}

// lib_db.py:541-556: rank i onto the i-th item; only a file whose priority changes is rewritten.
// int(priority): a quoted "0" equals rank 0.
const asInt = p => (typeof p === 'string' && /^\s*[+-]?\d+\s*$/.test(p) ? Number(p) : p);
function applyDense(dir, items, inScope) {
  return items.map((i, rank) => {
    if (!i.ghost && inScope(i) && asInt(i.fm.priority ?? -1) !== rank) write({ path: join(dir, i.path), fm: { ...i.fm, priority: rank, updated: now() }, body: i.body }, dir);
    return [slugOf(i), rank];
  });
}

// A session bound to a team (TEAM_REPOSITORY/TEAM_BRANCH) ranks only its own items, beyond python parity. The queue is one for the whole folder, so
// the other items keep their ranks and their files are not written: the team's items are re-ordered among the ranks they already hold
// (a move target is a position among the team's own items), and stay dense when the queue was.
const inScope = i => !outsideTeam(i.fm);
function within(items, arrange) {
  const at = items.flatMap((i, k) => (inScope(i) ? [k] : []));
  const mine = arrange(at.map(k => items[k]));
  const out = [...items];
  at.forEach((k, n) => { out[k] = mine[n]; });
  return out;
}

// lib_db.py:558-567: re-densify in current order; with {slug, target}, first move that item to the clamped rank.
export function reflow(dir, move) {
  const items = within(actionable(dir), mine => {
    if (!(move && move.slug != null && move.target != null)) return mine;
    const moving = mine.filter(i => slugOf(i) === move.slug);
    const rest = mine.filter(i => slugOf(i) !== move.slug);
    const t = Math.max(0, Math.min(Math.trunc(Number(move.target)), rest.length));
    return [...rest.slice(0, t), ...moving, ...rest.slice(t)];
  });
  return applyDense(dir, items, inScope);
}

// lib_db.py:570-584: idents (slugs or item numbers, never row ids) lead; the rest keeps its order.
export function reorder(dir, idents) {
  const all = actionable(dir);
  const items = all.filter(inScope);
  const bySlug = new Map(items.map(i => [slugOf(i), i]));
  const bySeq = new Map(items.map(i => [String(i.fm.seq), i]));
  const lead = [];
  for (const ident of idents) {
    const key = String(ident).trim();
    const i = bySlug.get(key) || bySeq.get(key.replace(/^0+/, '') || '0');
    if (i && !lead.includes(i)) lead.push(i);
  }
  const order = [...lead, ...items.filter(i => !lead.includes(i))];
  return applyDense(dir, within(all, () => order), inScope);
}

// lib_db.py:296-299
export const inQueue = (item, repo, branchName) => (item.fm.repository || '') === repo && (item.fm.branch || '') === branchName;

// lib_db.py:302-313. The folder repository is the folder's last two path parts. Archived items (and a NULL status,
// which NOT IN never matches) are out of every finding; ghost is a non-archived mirror row whose file is gone.
export function findings(dir) {
  const out = { foreign: [], untagged: [], ghost: [] };
  const folderRepo = resolve(dir).split(sep).slice(-2).join('/');
  for (const i of load(dir)) {
    if (!i.path.startsWith('phases/') || statusOf(i) === null || statusOf(i) === 'archived') continue;
    if (!i.fm.repository || !i.fm.branch) out.untagged.push(i);
    else if (i.fm.repository !== folderRepo) out.foreign.push(i);
  }
  out.ghost = withMirror(dir, db => db.prepare("SELECT * FROM phase WHERE status NOT IN ('archived')").all()
    .filter(r => !existsSync(join(dir, String(r.path ?? '')))).map(r => ({ ...r }))) ?? [];
  return out;
}

// lib_db.py:159-160
export const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
