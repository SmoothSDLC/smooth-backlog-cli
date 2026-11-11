// Shared store for the shared backlog repository mode: reads and
// writes the Python skill's item files in <home>/<owner>/<name>. Cited source: the pinned
// oracle at ec5b254e (contract v3). It never clones, commits or pushes.
// The surface is synchronous (spawnSync, tmp + rename) so sync and async callers can use it.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BacklogError, operation } from '../errors.js';
import { asChild, locked } from '../storage.js';
import { dumpItem as dump, hasFrontMatter, isItemName, itemFileName, itemSlug, parseItem as parse, readItemFile, readItemText, toFileKeys, entriesOf } from './item-file.js';
import { repoIdFromUrl } from './safety.js';
import * as index from './index.js';
import { actor, created, guarded, trail } from './seen.js';
import { CONFIG, configuredHome, NEUTRAL_NAME, originSetting, topOf } from './setup.js';
import { highWater, numberOf, MAX_SEQ, tooBig } from './numbers.js';
import { seam } from './seam.js';
import { asList } from './text.js';
import { historyEntry } from './item-json.js';
import { lifted } from './status.js';
import { derivedKeys, dropsLegacy, isArchived, isOpen } from './status.js';

const expand = p => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p);
export const configDir = () => process.env.XDG_CONFIG_HOME || join(homedir(), '.config'); //

// The one storage setting: the folder that holds the items. Named by SMOOTH_BACKLOG_CLI_HOME, by the repository's configuration
// (.backlog/config.json, backlog_repository: a path relative to the repository; ".backlog" means inside it; the root file of
// earlier builds is still read), or by the per-user record $XDG_CONFIG_HOME/<name>/home (<name> from the clone-URL setting;
// without the setting, the only record there); with a clone URL and nothing else, ~/git/<name>. Nothing named anywhere: the
// backlog is .backlog inside the repository, created with its config on first use (the owner's intended default; environment
// variables override the configuration). A folder inside the repository keeps the lock, views and journal in its .state
// (ignored by git); a folder elsewhere must exist (a missing clone is returned tagged ask, never cloned here).
export const FIRST_USE_CONFIG = `${JSON.stringify({ backlog_repository: '.backlog' }, null, 2)}\n`; // what the first use writes; only a file with exactly this content is committed with the first item
export const FIRST_USE_IGNORE = '.state/\n';
export function resolveHome() {
  const setting = originSetting();
  const name = setting.name || NEUTRAL_NAME;
  let home = process.env.SMOOTH_BACKLOG_CLI_HOME;
  if (!home) home = configuredHome() ?? undefined; // the repository's .smooth-backlog.json comes before the per-user record
  if (!home) {
    const records = (() => { try { return readdirSync(configDir()).filter(d => existsSync(join(configDir(), d, 'home'))); } catch { return []; } })();
    const chosen = setting.name ? (records.includes(name) ? name : null) : (records.length === 1 ? records[0] : null);
    if (chosen) { try { home = readFileSync(join(configDir(), chosen, 'home'), 'utf8').trim(); } catch { /* unreadable record */ } }
    else if (!setting.url && records.length > 1) {
      return { home: null, remote: true, ask: { code: 4, text: `two backlog records (${records.join(', ')}) and no setting name one of them: run backlog setup in this repository, or set SMOOTH_BACKLOG_CLI_HOME` } };
    }
  }
  if (!home && !setting.url) { // nothing configured anywhere: the backlog is .backlog inside the repository, created with its config
    const top = topOf(process.cwd());
    if (!top) return { home: null, remote: false, ask: { code: 2, text: 'run this from inside a git repository (the repository whose backlog you want)' } };
    home = join(top, '.backlog');
    mkdirSync(join(home, '.state'), { recursive: true });
    if (!existsSync(join(top, CONFIG))) writeFileSync(join(top, CONFIG), FIRST_USE_CONFIG);
  }
  if (home) { // a folder inside the repository: the items are committed with it
    const top = topOf(process.cwd());
    const abs = resolve(expand(home));
    if (top && !relative(top, abs).startsWith('..') && !isAbsolute(relative(top, abs))) {
      insideRepo = true;
      mkdirSync(join(abs, '.state'), { recursive: true });
      if (!existsSync(join(abs, '.gitignore'))) writeFileSync(join(abs, '.gitignore'), FIRST_USE_IGNORE);
      return { home: abs, remote: false, ask: null };
    }
  }
  home = resolve(expand(home || join('~/git', name)));
  // Symlinks above the home (macOS /var, a linked ~) are resolved once here; a link AT the home is kept for validateHome to refuse.
  if (existsSync(home)) { return { home: join(realpathSync(dirname(home)), basename(home)), remote: true, ask: null }; }
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
export const lockEnv = home => ({ SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD: `${lockPath(home)}:${process.pid}` });
export const lockWait = () => (Number(process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS) > 0 ? Number(process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS) : 120000);
export function cloneLocked(home, fn) {
  const path = lockPath(home);
  if (held.has(path)) return guarded(fn);
  // a child its holder runs and waits for (pop --claim-now's update) names itself in the record while it works, so a
  // parent killed meanwhile leaves a live holder, never a lock to take over
  if (process.env.SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD === `${path}:${process.ppid}`) return asChild(path, () => guarded(fn));
  // a normal update (pull, write, push over the network) can take a while: a command behind it waits, 120 s unless SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS says otherwise
  return locked(path, async () => {
    held.add(path);
    recoverJournal(home); // a killed predecessor's half-done change goes first
    try { return await guarded(fn); } finally { held.delete(path); }
  }, { wait: lockWait(), takeOver: true });
}

export function git(args, cwd) {
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
// The paths a command writes, renames or removes, with their content before (null: absent): undoOnThrow puts back exactly these.
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

// Rolls back what a killed command left (see above): every path to its prior bytes or absence, and the git index
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

// every write drops the two retired classification keys and the rank an earlier build kept in the item (the order is the index now). The
// names are built from parts because the 049 contract greps src for the literal words; this is the one place that has to name them.
const RETIRED_KEYS = [['work', 'class'].join('_'), ['review', 'classes'].join('_'), 'priority'];
const LEGACY_KEYS = ['stage', 'review_state']; // the word in status says what these said; an item that carries a word does not write them

// The keys of the file that differ between two in-memory items, as { key: [before, after] } (a key that is absent reads null; the slug is under 'slug').
// updated and updated_by are the entry's own at and by, and the history is what the entry joins: none of the three is a change.
const STAMPS = new Set(['updated', 'updated_by', 'events']);
function changesOf(before, after) {
  const a = before ? toFileKeys(before) : {}, b = toFileKeys(after), out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!STAMPS.has(k) && JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) out[k === 'phase' ? 'slug' : k] = [a[k] ?? null, b[k] ?? null];
  }
  return out;
}
// The one history entry of the running command for an item (addEvent declared its step and note): who and when, what changed, the note.
// The session is only the caller's SMOOTH_BACKLOG_CLI_SESSION (never the agent name that lifecycle falls back to). No change and no note: no entry.
function entryOf(d, fm) {
  const changes = changesOf(d.before, fm);
  const note = d.note || (Object.keys(changes).length ? d.planning : ''); // a planning sentence alone is no change
  return Object.keys(changes).length || note ? historyEntry({ at: d.at, by: actor(), session: process.env.SMOOTH_BACKLOG_CLI_SESSION ?? '', step: d.step, changes, note }) : null;
}

export const write = (item, root) => writeItem(trail(), item, root);
function writeItem(t, item, root) {
  // an item is written as it is: every key it holds is kept (a field may be called priority or stage); only the old team code, which reads the earlier words
  // and derives stage and review_state, still has the retired keys and what it derived dropped (it goes with that code)
  if (seam.entry) item = { ...item, fm: Object.fromEntries(Object.entries(item.fm).filter(([k]) => !RETIRED_KEYS.includes(k) && !(LEGACY_KEYS.includes(k) && (dropsLegacy(item.fm) || derivedKeys(item.fm).has(k))))) };
  const inferred = /^(.*?)[/\\](?:phases|archive)[/\\]/.exec(item.path)?.[1];
  const base = root ?? (inferred || dirname(item.path));
  assertFolder(base);
  assertNoSymlinks(base, item.path);
  index.seed(base);
  const key = resolve(item.path);
  if (t && !t.has(key)) t.set(key, { before: existsSync(item.path) ? (() => { try { return readItemFile(item.path).fm; } catch { return null; } })() : null }); // what the command found
  const d = t?.get(key);
  if (d?.step && d.open) { // one entry per command: a later addEvent of it replaces the command's own entry (the newest equal one) or appends it; every other entry of the document stays
    const at = entriesOf(item.fm).map(e => JSON.stringify(e)).lastIndexOf(JSON.stringify(d.entry ?? null));
    d.entry = entryOf(d, item.fm);
    item.fm.events = [...entriesOf(item.fm).filter((_, i) => i !== at), ...[d.entry].filter(Boolean)];
  } else if (d?.step) { // a write the publication path makes after the command (a renumbering remapping the references): its own entry, against the file it rewrites; the command's entry stays as it was
    const disk = existsSync(item.path) ? (() => { try { return readItemFile(item.path).fm; } catch { return null; } })() : null;
    const changes = changesOf(disk, item.fm);
    if (Object.keys(changes).length) item.fm.events = [...entriesOf(item.fm), { at: now(), by: actor(), session: process.env.SMOOTH_BACKLOG_CLI_SESSION ?? '', step: 'renumber', changes, note: '' }];
  }
  if (!existsSync(item.path)) created(base, relative(base, item.path));
  note(item.path);
  atomicWrite(item.path, dump(item.fm, item.body));
}

// A text file of the repository folder that is no item (the index): the same checks, journal and atomic write as an item.
export function writeText(path, text, root) {
  assertFolder(root);
  assertNoSymlinks(root, path);
  note(path);
  atomicWrite(path, text);
}

// The fields `backlog update <item> --<field> <value>` can set again when an item cannot be read (a key of a valid JSON file that holds a wrong type).
export const REPAIRABLE = ['status', 'commit', 'location', 'summary', 'name', 'objective', 'seq', 'size_score'];

// An item that cannot be read, after the latest version was pulled: the refusal every command of the folder gives (exit 2) names the
// item (never its path), the key the codec could not read, and the way out: --restore, and for a valid JSON file with one wrongly typed key also --<key>.
export function unreadableItem(path, e) {
  const slug = itemSlug(path);
  const reason = String(e.message).replace(/^item file:? /, '').replace(/\s+/g, ' '); // one line
  const restore = `Restore the item's previous version with backlog update ${slug} --restore`;
  const message = e.field === undefined
    ? `item ${slug}: the file ${reason}. ${restore}`
    : `item ${slug}: the key ${e.field} cannot be read (${reason.startsWith(`${e.field} `) ? reason.slice(e.field.length + 1) : reason}). ${REPAIRABLE.includes(e.field) ? `Fix it with backlog update ${slug} --${e.field} <value>, or ${restore[0].toLowerCase()}${restore.slice(1)}` : restore}`;
  return Object.assign(new BacklogError('UNREADABLE_ITEM', message, 2), { unreadable: { slug, path, key: e.field } });
}
function readItem(path, text) {
  try { return parse(text); } catch (e) { throw unreadableItem(path, e); }
}

// The refusal of the first item of the folder that cannot be read, or null when every item can.
export function unreadable(dir) {
  try { load(dir); return null; } catch (e) { if (e.unreadable) return e; throw e; }
}

// The item files of a folder (live in phases/, archived under archive/, paths relative to it, in name order) and whether the folder holds markdown items (markdownItems: those files).
// The one walk of every reader: a link anywhere below the folder and an item file named with a number above the bound stop it. tolerant: they are
// listed instead, as skipped = [{ path, kind: 'link' | 'number', error }], and the walk goes on.
export function itemFiles(dir, { tolerant = false } = {}) {
  assertFolder(dir);
  const files = [];
  const markdown = [];
  const skipped = [];
  const walk = (rel, deep) => {
    try { assertNoSymlinks(dir, join(dir, rel)); } catch (e) { if (!tolerant) throw e; skipped.push({ path: rel, kind: 'link', error: e }); return; }
    let entries;
    try { entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    for (const e of entries) {
      const path = `${rel}/${e.name}`;
      if (e.isSymbolicLink()) { try { assertNoSymlinks(dir, join(dir, path)); } catch (err) { if (!tolerant) throw err; skipped.push({ path, kind: 'link', error: err }); continue; } }
      if (e.isDirectory() && deep) walk(path, deep);
      else if (e.isFile() && numberOf(e.name) > MAX_SEQ) { if (!tolerant) throw tooBig(e.name); skipped.push({ path, kind: 'number', error: tooBig(e.name) }); } // an item file named with a number above the bound stops every command of the folder
      else if (e.isFile() && isItemName(e.name)) files.push(path);
      else if (e.isFile() && e.name.endsWith('.md')) markdown.push(path);
    }
  };
  walk('phases', false);
  walk('archive', true);
  // a folder of markdown items is no folder of items; a .md file without a header (a README) is no item
  const markdownItems = markdown.filter(path => hasFrontMatter(readItemText(join(dir, path))));
  return { files, skipped, markdown: markdownItems.length > 0, markdownItems };
}
// The refusal of a folder of markdown items (exit 2).
export const markdownError = dir => Object.assign(new BacklogError('MARKDOWN_ITEMS', `the items of ${resolve(dir).split(sep).slice(-2).join('/')} are markdown files; run backlog team migrate once to convert every item to JSON`, 2), { markdown: dir });

export function load(dir) {
  const { files, markdown } = itemFiles(dir);
  if (markdown) throw markdownError(dir); // stops before any item is read
  return files.map(path => {
    const text = readItemText(join(dir, path));
    const sha256 = createHash('sha256').update(text).digest('hex'); //
    return { path, ...lifted(readItem(path, text)), sha256, sha: sha256 };
  });
}

// The highest number the folder ever held: its history (every ref, merge commits included), every value numbers.json ever had, the item files
// present and their seq (numbers.js). A number is never handed out at or below it.
export function mark(dir) {
  return Math.max(highWater(dir), ...load(dir).map(i => { const n = Number(i.fm.seq) || 0; return n <= MAX_SEQ ? n : 0; })); // a stored seq above the bound never raises the mark
}

// The next number: one above the mark. Deleting, cleaning or archiving the newest item never gives its number again.
export function nextSeq(dir) {
  const n = mark(dir) + 1;
  if (n > MAX_SEQ) throw new BacklogError('STORAGE_ERROR', `the folder has no number left: the highest number the CLI can use (${MAX_SEQ}) is taken`, 2);
  return n;
}

// nextSeq whose file name `<seq><tail>` (tail: '-name' and the item extension) is also free in phases/ and archive/: update --seq can leave a low number unused while
// its neighbour's name stays, so the next number alone does not make the name new, and a write by path would replace that item.
export function nextSeqFor(dir, tail, floor = 0) { // floor: a mark taken earlier (before a pull), never to be handed out again
  let bare = []; try { bare = readdirSync(join(dir, 'phases')); } catch { /* no phases/ yet */ } // a file without front matter is not an item, but its name is taken
  const taken = new Set([...bare, ...load(dir).flatMap(i => [basename(i.path), itemFileName(i.fm.phase)])]);
  let n = Math.max(nextSeq(dir), floor + 1);
  while (taken.has(String(n).padStart(3, '0') + tail)) n++;
  if (n > MAX_SEQ) throw new BacklogError('STORAGE_ERROR', `the folder has no number left: the highest number the CLI can use (${MAX_SEQ}) is taken`, 2); // the floor or a taken name can push past the bound
  return n;
}

const slugOf = i => i.fm.phase || itemSlug(i.path); // ingest_phase slug
const statusOf = i => (Object.hasOwn(i.fm, 'status') ? i.fm.status : 'pending');
const branchOf = i => String(i.fm.branch || '');

// The order of the backlog is the repository folder's index (index.js): a rank change writes it and no item. A session bound to a team
// (set by backlog team) orders only its own items, beyond python parity: the other items keep their places, and the team's items
// are re-ordered among the places they already hold (a move target is a position among the team's own items).
const inScope = i => seam.inScope(i.fm);

// Makes the index right against the item files (new items appended, gone ones dropped, name and status copied from the files, open items
// first) and, with { slug, target }, first moves that item to the clamped rank among the open items of its branch. { branches: [branch] } names
// the branch whose open order is returned, [[slug, rank]] (a move names its item's branch). { renames } follows a renumbering.
export function reflow(dir, move = {}) {
  const items = load(dir);
  const moving = move.slug != null ? items.find(i => slugOf(i) === move.slug) : null;
  const { idx, order } = index.reconcile(index.current(dir, items), items, { move, renames: move.renames, inScope, branches: move.branches ?? (moving ? [branchOf(moving)] : undefined) });
  index.write(dir, idx);
  return order;
}

// idents (slugs or item numbers, never row ids) lead their branch; the rest keeps its order. Resolves the open order of the branches they name.
export function reorder(dir, idents) {
  const items = load(dir);
  const open = items.filter(i => i.path.startsWith('phases/') && isOpen(statusOf(i)) && inScope(i));
  const bySlug = new Map(open.map(i => [slugOf(i), i]));
  const bySeq = new Map(open.map(i => [String(i.fm.seq), i]));
  const lead = [];
  for (const ident of idents) {
    const key = String(ident).trim();
    const i = bySlug.get(key) || bySeq.get(key.replace(/^0+/, '') || '0');
    if (i && !lead.includes(i)) lead.push(i);
  }
  const { idx, order } = index.reconcile(index.current(dir, items), items, { lead: lead.map(slugOf), inScope, branches: lead.length ? [...new Set(lead.map(branchOf))] : undefined });
  index.write(dir, idx);
  return order;
}

// A command that writes item files must leave nothing behind when it throws (nothing is committed yet, so the next successful
// command would publish it): fn runs, and on a throw exactly the files it wrote, renamed or removed (store.note, called by every
// writer) go back as they were. A file the command did not write is never touched.
// Beyond python parity. shortcut: the files are held in memory; fine for a backlog folder.
export async function undoOnThrow(folder, fn) {
  let touched;
  const opened = beginJournal(folder);
  try {
    try { return await journalled(async j => { touched = j; return fn(); }); } catch (e) {
      for (const [p, prior] of touched) {
        if (prior === null) rmSync(p, { force: true }); else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, prior); }
      }
      throw e;
    } finally {
      // a nested undo that succeeded hands its paths to the outer one, which may still fail
      if (touched) for (const [p, prior] of touched) note(p, prior);
    }
  } finally { if (opened) endJournal(); }
}


//. The folder repository is the folder's last two path parts. Archived items (and a NULL status,
// which NOT IN never matches) are out of every finding.
export function findings(dir) {
  const out = { foreign: [], untagged: [] };
  const folderRepo = resolve(dir).split(sep).slice(-2).join('/');
  for (const i of load(dir)) {
    if (!i.path.startsWith('phases/') || statusOf(i) === null || isArchived(i)) continue;
    if (!i.fm.repository || !i.fm.branch) out.untagged.push(i);
    else if (i.fm.repository !== folderRepo) out.foreign.push(i);
  }
  return out;
}

//
export const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export { hasFrontMatter, isItemName, itemFileName, itemSlug, parseEvent, storedFm } from './item-file.js'; // the event record of an item's history is written by item-file.js
// Declares the step and the note of the running command's history entry for an item and rewrites the file, which gains the entry (write builds it).
// The first event names the step; a later one (the planning sentence) is the note only when the command has none. The file is re-read first.
export function addEvent(folder, path, { event, note = '', before }) { // before: the item as it was when the file at this path is not it (a renumbered item written to its new path)
  const abs = join(folder, path);
  const { fm, body } = readItemFile(abs);
  const t = trail() ?? new Map(); // outside a command: this call alone is the command
  const d = t.get(resolve(abs)) ?? t.set(resolve(abs), { before: fm }).get(resolve(abs));
  const text = String(note).replace(/\s+/g, ' ').trim();
  if (!d.step) { if (before) d.before = before; d.step = event; d.at = now(); d.note = ''; d.planning = ''; }
  if (event === 'planning_event') d.planning ||= text; else d.note ||= text;
  d.open = true;
  try { writeItem(t, { path: abs, fm, body }, folder); } finally { d.open = false; }
  return d.entry;
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
