// Shared store for the shared backlog repository mode: reads and
// writes the Python skill's item files in <home>/<owner>/<name>. Cited source: the pinned
// oracle at ec5b254e (contract v3). It never clones, commits or pushes.
// The surface is synchronous (spawnSync, tmp + rename) so sync and async callers can use it.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { operation } from '../errors.js';
import { asChild, locked } from '../storage.js';
import { dump, hasFrontMatter, parse, replaceFrontMatter } from './frontmatter.js';
import { repoIdFromUrl } from './safety.js';
import { actor, created, guarded, guardReflow } from './seen.js';
import { CONFIG, configuredHome, NEUTRAL_NAME, originSetting, topOf } from './setup.js';
import { asList, outsideTeam, setTeamsHome } from './team.js';

const ACTIONABLE = ['pending', 'in_progress'];

const expand = p => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p);
const configDir = () => process.env.XDG_CONFIG_HOME || join(homedir(), '.config'); //

// The one storage setting: the folder that holds the items. Named by BACKLOG_HOME, by the repository's configuration
// (.backlog/config.json, backlog_repository: a path relative to the repository; ".backlog" means inside it; the root file of
// earlier builds is still read), or by the per-user record $XDG_CONFIG_HOME/<name>/home (<name> from the clone-URL setting;
// without the setting, the only record there); with a clone URL and nothing else, ~/git/<name>. Nothing named anywhere: the
// backlog is .backlog inside the repository, created with its config on first use (the owner's intended default; environment
// variables override the configuration). A folder inside the repository keeps the lock, views and journal in its .state
// (ignored by git); a folder elsewhere must exist (a missing clone is returned tagged ask, never cloned here).
export function resolveHome() {
  const setting = originSetting();
  const name = setting.name || NEUTRAL_NAME;
  let home = process.env.BACKLOG_HOME;
  if (!home) home = configuredHome() ?? undefined; // the repository's .smooth-backlog.json comes before the per-user record
  if (!home) {
    const records = (() => { try { return readdirSync(configDir()).filter(d => existsSync(join(configDir(), d, 'home'))); } catch { return []; } })();
    const chosen = setting.name ? (records.includes(name) ? name : null) : (records.length === 1 ? records[0] : null);
    if (chosen) { try { home = readFileSync(join(configDir(), chosen, 'home'), 'utf8').trim(); } catch { /* unreadable record */ } }
    else if (!setting.url && records.length > 1) {
      return { home: null, remote: true, ask: { code: 4, text: `two backlog records (${records.join(', ')}) and no setting name one of them: run backlog setup in this repository, or set BACKLOG_HOME` } };
    }
  }
  if (!home && !setting.url) { // nothing configured anywhere: the backlog is .backlog inside the repository, created with its config
    const top = topOf(process.cwd());
    if (!top) return { home: null, remote: false, ask: { code: 2, text: 'run this from inside a git repository (the repository whose backlog you want)' } };
    home = join(top, '.backlog');
    mkdirSync(join(home, '.state'), { recursive: true });
    if (!existsSync(join(top, CONFIG))) writeFileSync(join(top, CONFIG), `${JSON.stringify({ backlog_repository: '.backlog' }, null, 2)}\n`);
  }
  if (home) { // a folder inside the repository: the items are committed with it
    const top = topOf(process.cwd());
    const abs = resolve(expand(home));
    if (top && !relative(top, abs).startsWith('..') && !isAbsolute(relative(top, abs))) {
      insideRepo = true;
      mkdirSync(join(abs, '.state'), { recursive: true });
      if (!existsSync(join(abs, '.gitignore'))) writeFileSync(join(abs, '.gitignore'), '.state/\n');
      setTeamsHome(abs);
      return { home: abs, remote: false, ask: null };
    }
  }
  home = resolve(expand(home || join('~/git', name)));
  // Symlinks above the home (macOS /var, a linked ~) are resolved once here; a link AT the home is kept for validateHome to refuse.
  if (existsSync(home)) { setTeamsHome(home); return { home: join(realpathSync(dirname(home)), basename(home)), remote: true, ask: null }; }
  return {
    home,
    remote: true,
    ask: {
      code: 4,
      text: `the backlog repository ${setting.id} is configured but not cloned at ${home}: run 'backlog setup' in this repository `
        + "(it clones it beside the repository) or 'backlog setup --ask' (it asks for the path), then run this command again.",
    },
  };
}

// The per-clone cache of one backlog folder: <state>/cache/<owner>--<name>.db, rebuilt from the item files by db.connect.
export function cacheFile(folder) {
  const f = resolve(folder);
  return join(stateDir(dirname(dirname(f))), 'cache', `${basename(dirname(f))}--${basename(f)}.db`);
}

// Where the lock, the views and the journal live: the clone's.git folder, or.state inside the repository's.backlog folder.
// The remote branch the items are published to: the backlog clone's main, or the current branch of the repository that holds a .backlog folder.
export const originRef = home => (existsSync(join(home, '.git')) ? 'origin/main' : `origin/${git(['branch', '--show-current'], home).stdout.trim() || 'main'}`);
export const stateDir = home => (existsSync(join(home, '.git')) ? join(home, '.git') : join(home, '.state'));


// <home>/<owner>/<name>. Each part must be a plain name: no separators, no. or..
export function folder(home, repoId) {
  const parts = String(repoId).split('/');
  if (parts.length !== 2 || parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) throw new Error(`not an owner/name repository id: ${repoId}`);
  return join(resolve(home), ...parts);
}

// The one operation lock of the clone: every command that can pull, write item files or touch the item files (reads that pull included) holds it
// from before its pull to after its push, whatever repository folders it works on. Re-entrant in the process (query --plan runs the pop module), and for
// a child its holder runs and waits for, which is given lockEnv(home) (pop --claim-now runs update).
const held = new Set();
const lockPath = home => join(stateDir(home), 'smooth-backlog-cli-run.lock');
export const lockEnv = home => ({ BACKLOG_RUN_LOCK_HELD: `${lockPath(home)}:${process.pid}` });
export function cloneLocked(home, fn) {
  const path = lockPath(home);
  if (held.has(path)) return guarded(fn);
  // a child its holder runs and waits for (pop --claim-now's update) names itself in the record while it works, so a
  // parent killed meanwhile leaves a live holder, never a lock to take over
  if (process.env.BACKLOG_RUN_LOCK_HELD === `${path}:${process.ppid}`) return asChild(path, () => guarded(fn));
  // a normal update (pull, write, push over the network) can take a while: a command behind it waits, 120 s unless BACKLOG_LOCK_WAIT_MS says otherwise
  return locked(path, async () => {
    held.add(path);
    recoverJournal(home); // a killed predecessor's half-done change goes first
    try { return await guarded(fn); } finally { held.delete(path); }
  }, { wait: Number(process.env.BACKLOG_LOCK_WAIT_MS) > 0 ? Number(process.env.BACKLOG_LOCK_WAIT_MS) : 120000, takeOver: true });
}

function git(args, cwd) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { stdout: String(p.stdout || ''), code: p.status ?? 1 };
}

// owner/name from the origin; a worktree shares its main tree's remotes. Inside the repository (resolveHome found no backlog
// repository) the id is constant: the folder is the repository, and its items survive a renamed folder or a changed origin.
let insideRepo = false;
export const INSIDE_REPO_ID = 'local/repository';
export function repoId(cwd) {
  if (git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).code) throw new Error('run this from inside a git repository (the repository whose backlog you want)');
  if (insideRepo) return INSIDE_REPO_ID;
  const id = repoIdFromUrl(git(['remote', 'get-url', 'origin'], cwd).stdout);
  return id || `local/${basename(git(['rev-parse', '--show-toplevel'], cwd).stdout.trim())}`; // no origin: the folder's name
}

//
export function branch(cwd) {
  const b = git(['branch', '--show-current'], cwd).stdout.trim();
  if (!b) throw new Error('HEAD is detached; check out the branch the item belongs to first');
  return b;
}

function atomicWrite(path, text) { // the semantics of src/storage.js atomicWrite, synchronous
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${randomUUID()}.tmp`); // never the item's name plus a suffix, which can pass 255 bytes
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

//. item.path is absolute (the caller joins the folder and the load-relative path).
// root is the repository folder; without it, the folder is what precedes the first phases/ or archive/ segment.
// The paths a command writes, renames or removes, with their content before (null: absent): db.undoOnThrow puts back exactly these.
// Whoever changes an item file calls note(path) first; write does.
const journals = [];
export const journalled = fn => { const j = new Map(); journals.push(j); return fn(j).finally(() => journals.pop()); };

// The recovery journal: the same priors, on disk (fsynced) before each write, for the outermost undoOnThrow only. A process killed inside that
// window (no catch runs) leaves it behind; the next command that takes the clone lock rolls it back first (recoverJournal). It lives in.git:
// git never sees it. persist = {home, files: Map<path, base64 | null>, folders: Set}.
let persist = null;
const journalFile = home => join(stateDir(home), 'smooth-backlog-cli-journal.json');
function saveJournal() {
  const tmp = `${journalFile(persist.home)}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try { writeSync(fd, JSON.stringify({ home: persist.home, files: Object.fromEntries(persist.files), folders: [...persist.folders] })); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, journalFile(persist.home));
}
export function beginJournal(folder) { // true when this call opened the journal (the outermost undo); it also covers `folder`
  const home = dirname(dirname(resolve(folder)));
  if (!persist && existsSync(stateDir(home))) { persist = { home, files: new Map(), folders: new Set() }; var opened = true; }
  if (persist) persist.folders.add(resolve(folder));
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
  // The paths were written in the spelling of the process that died (/var/... on macOS), this one may spell the clone differently (/private/var/...):
  // each is taken relative to the home the journal names and rebuilt under this process's home; a path outside the clone is never touched.
  const inside = path => { const rel = relative(resolve(rec.home ?? home), resolve(path)); return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : join(home, rel); };
  for (const [recorded, b64] of Object.entries(rec.files)) {
    const path = inside(recorded);
    if (!path) continue;
    if (b64 === null) rmSync(path, { force: true }); else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(b64, 'base64')); }
  }
  for (const recorded of rec.folders ?? []) { const folder = inside(recorded); if (folder) git(['reset', '-q', '--', '.'], folder); }
  rmSync(file, { force: true });
  process.stderr.write(`backlog: rolled back a command that was killed half-way (${Object.keys(rec.files).length} path(s) restored in ${home})\n`);
}

// every write drops the two retired classification keys. The names are built from parts because the 049
// contract greps src for the literal words; this is the one place that has to name them.
const RETIRED_KEYS = [['work', 'class'].join('_'), ['review', 'classes'].join('_')];

export function write(item, root, { frontMatterOnly = false } = {}) {
  item = { ...item, fm: Object.fromEntries(Object.entries(item.fm).filter(([k]) => !RETIRED_KEYS.includes(k))) };
  const inferred = /^(.*?)[/\\](?:phases|archive)[/\\]/.exec(item.path)?.[1];
  const base = root ?? (inferred || dirname(item.path));
  assertFolder(base);
  assertNoSymlinks(base, item.path);
  if (!existsSync(item.path)) created(base, relative(base, item.path));
  note(item.path);
  atomicWrite(item.path, frontMatterOnly ? replaceFrontMatter(readFileSync(item.path, 'utf8'), item.fm) : dump(item.fm, item.body));
}

// phases/*.md, then archive/**/*.md. path is folder-relative with '/'.
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
        const sha256 = createHash('sha256').update(text).digest('hex'); //
        if (rel === 'phases' && !hasFrontMatter(text)) continue; // a README or a stray note in phases/ is not an item: ranking it would rewrite it as an empty one (see bareFiles)
        items.push({ path, ...parse(text), sha256, sha: sha256 });
      }
    }
  };
  walk('phases', false);
  walk('archive', true);
  return items;
}

// 1 + max(seq of phases/ and archive/): the item files alone number the items.
export function nextSeq(dir) {
  return Math.max(0, ...load(dir).map(i => Number(i.fm.seq) || 0)) + 1;
}

// nextSeq whose file name `<seq><tail>` (tail: '-name.md') is also free in phases/ and archive/: update --seq can leave a low number unused while
// its neighbour's name stays, so the next number alone does not make the name new, and a write by path would replace that item.
export function nextSeqFor(dir, tail) {
  let bare = []; try { bare = readdirSync(join(dir, 'phases')); } catch { /* no phases/ yet */ } // a file without front matter is not an item, but its name is taken
  const taken = new Set([...bare, ...load(dir).flatMap(i => [basename(i.path), `${i.fm.phase}.md`])]);
  let n = nextSeq(dir);
  while (taken.has(String(n).padStart(3, '0') + tail)) n++;
  return n;
}

const slugOf = i => i.fm.phase || basename(i.path, '.md'); // ingest_phase slug

// pending/in_progress items of phases/ (all branches), priority then seq.
// Absent keys read as the mirror database defaults (status pending, priority 50, seq 0); an explicit null stays null.
const statusOf = i => (Object.hasOwn(i.fm, 'status') ? i.fm.status : 'pending');
function actionable(dir) {
  const items = load(dir);
  const live = items.filter(i => i.path.startsWith('phases/'));
  const files = live.filter(i => ACTIONABLE.includes(statusOf(i)));
  return files.sort((a, b) => ((a.fm.priority ?? 50) - (b.fm.priority ?? 50)) || ((a.fm.seq ?? 0) - (b.fm.seq ?? 0)));
}

// rank i onto the i-th item; only a file whose priority changes is rewritten.
// int(priority): a quoted "0" equals rank 0.
const asInt = p => (typeof p === 'string' && /^\s*[+-]?\d+\s*$/.test(p) ? Number(p) : p);
function applyDense(dir, items, inScope, beforeApply) {
  const changes = items.map((i, rank) => inScope(i) && asInt(i.fm.priority ?? -1) !== rank);
  // Validate the entire reflow write set before rewriting any of it; a leading pull is not an agent read.
  const writes = items.filter((i, rank) => changes[rank]);
  guardReflow(dir, writes);
  beforeApply?.(writes);
  return items.map((i, rank) => {
    if (changes[rank]) write({ path: join(dir, i.path), fm: { ...i.fm, priority: rank }, body: i.body }, dir); // a rank is no change of the item: updated stays
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

// re-densify in current order; with {slug, target}, first move that item to the clamped rank.
// exclude omits explicitly departed items before their mirror rows are changed.
export function reflow(dir, move, beforeApply) {
  const items = within(actionable(dir).filter(i => !move?.exclude?.includes(slugOf(i))), mine => {
    if (!(move && move.slug != null && move.target != null)) return mine;
    const moving = mine.filter(i => slugOf(i) === move.slug);
    const rest = mine.filter(i => slugOf(i) !== move.slug);
    const t = Math.max(0, Math.min(Math.trunc(Number(move.target)), rest.length));
    return [...rest.slice(0, t), ...moving, ...rest.slice(t)];
  });
  return applyDense(dir, items, inScope, beforeApply);
}

// idents (slugs or item numbers, never row ids) lead; the rest keeps its order.
export function reorder(dir, idents, beforeApply) {
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
  return applyDense(dir, within(all, () => order), inScope, beforeApply);
}


//. The folder repository is the folder's last two path parts. Archived items (and a NULL status,
// which NOT IN never matches) are out of every finding.
export function findings(dir) {
  const out = { foreign: [], untagged: [] };
  const folderRepo = resolve(dir).split(sep).slice(-2).join('/');
  for (const i of load(dir)) {
    if (!i.path.startsWith('phases/') || statusOf(i) === null || statusOf(i) === 'archived') continue;
    if (!i.fm.repository || !i.fm.branch) out.untagged.push(i);
    else if (i.fm.repository !== folderRepo) out.foreign.push(i);
  }
  return out;
}

//
export const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
// One event of an item's history is one front-matter line: "<ts> <event> <branch|-> <commit|-> <note>".
export const eventLine = ({ ts, event, branch, commitSha, note }) => [ts, event, branch || '-', commitSha || '-', String(note ?? '').replace(/\s+/g, ' ').trim()].filter((x, i) => i < 4 || x).join(' ');
export function parseEvent(line) {
  const [, ts, event, branch, commit, note] = /^(\S+) (\S+) (\S+) (\S+)(?: (.*))?$/.exec(line) ?? [];
  return { ts, event, branch: branch === '-' ? '' : branch, commit_sha: commit === '-' ? '' : commit, note: note ?? '' };
}
// Appends one event line to the item file's `events` list. The file is re-read first (the command may have written it a moment ago).
export function addEvent(folder, path, { event, branch = '', commitSha = '', note = '' }) {
  const abs = join(folder, path);
  const { fm, body } = parse(readFileSync(abs, 'utf8'));
  const line = eventLine({ ts: now(), event, branch, commitSha, note });
  fm.events = [...asList(fm.events), line];
  write({ path: abs, fm, body }, folder, { frontMatterOnly: true }); // keeps the body, BOM and line endings as they are
  return line;
}
// the one way an item write marks itself: when, and by whom (see seen.js)
export function stamp(fm) {
  const had = Object.hasOwn(fm, 'updated_by');
  Object.assign(fm, { updated: now(), updated_by: actor() });
  if (!had && Object.keys(fm).includes('updated')) { // a new key lands next to updated, not at the end
    const rest = Object.entries(fm).filter(([k]) => k !== 'updated_by');
    for (const k of Object.keys(fm)) delete fm[k];
    for (const [k, v] of rest) { fm[k] = v; if (k === 'updated') fm.updated_by = actor(); }
  }
  return fm;
}
