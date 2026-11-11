// Git sync of the shared backlog repository. Oracle:
// (pull before reading or writing) and 275-309 (commit and push after every change), the
// pinned ec5b254e. Node has no flock, so the lock is a pid file (locked of src/storage.js)
// and a number two clones picked at once is repaired after the rebase (renumber below).
// A failure to sync throws BacklogError with exitCode 3; the caller prints it and exits.
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { locked } from '../storage.js';
import { assertInside, git as run, redact } from './safety.js';
import { ITEM_EXT, ITEM_EXT_PATTERN, ITEM_PATH, itemSlug, itemSlugOfGitPath, parseItem as parse, readItemText } from './item-file.js';
import * as index from './index.js';
import { actor, primarySlug, publicationGuard, staleError, staleViews } from './seen.js';
import { counterText, highWater, NUMBER_FILE, numberOf, record as recordNumber } from './numbers.js';
import * as store from './store.js';
import { asList } from './text.js';
import { foreignCycle, foreignItem, isForeign } from './dependencies.js';


const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // what a branch the origin does not have yet is compared with: every file is new
const OFFLINE = '⚠️  origin offline, local backlog updates may be behind and need manual remediation later';
export const pullArgs = t => ['pull', '-q', '--rebase', '--autostash', 'origin', t.branch]; // explicit: the checkout's tracking branch and push.default are the user's, not ours
export const refspec = t => `+refs/heads/${t.branch}:refs/remotes/${t.ref}`;
const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad = n => String(n).padStart(3, '0');
// A renumbering is [old, new] of one repository folder: a number is only taken in its own folder, so a caller applies it to that folder alone.
const pairOf = (old, next, folder) => Object.defineProperty([old, next], 'folder', { value: resolve(folder) });
export const lockFile = home => join(store.stateDir(home), 'smooth-backlog-cli.lock');
const itemFile = t => new RegExp(`^${esc(t.prefix)}[^/]+/[^/]+/(phases|archive)/.+${ITEM_EXT_PATTERN}$`); // an item file, from the root of the repository that holds it

// git in the backlog clone; an index.lock held by a git run outside the CLI is retried 5 times
//. Everything git says goes through redact: a URL may carry a token.
export async function g(home, args) {
  let r;
  for (let i = 0; i < 5; i++) {
    if (i) await delay(500 * i);
    r = await run(args, home, { 'merge.directoryRenames': 'false' }); // a move that empties a folder must not drag another clone's new file along
    if (r.code === 0 || !r.stderr.includes('index.lock')) break;
  }
  return { ...r, stderr: redact(r.stderr).trim() };
}

// Git pathspecs are globs: ":(literal)" keeps a folder name such as acme/* from matching its siblings.
export const lit = path => `:(literal)${path}`;
// Every commit, including recovery squashes and amendments, leaves unrelated index entries alone.
export const commitOnly = (home, lits, options) => g(home, ['commit', '-q', ...options, '--only', '--', ...lits]);
export const fail = (home, what, r) => new BacklogError('SYNC_FAILED', `could not ${what} in ${home} (${r.stderr.slice(0, 300)}); the change is not recorded`, 3);
export const must = async (home, args, what) => { const r = await g(home, args); if (r.code) throw fail(home, what, r); return r; };

// Where the items are published: the backlog repository clone (its own repository, branch main), or the user's repository when the items live in
// its .backlog folder (the current branch, the backlog's paths under prefix). Every git command of this file runs at root with root-relative paths.
export async function target(home) {
  if (existsSync(join(home, '.git'))) return { root: home, branch: 'main', ref: 'origin/main', cmp: 'origin/main', prefix: '', clone: true, push: true };
  const top = await g(home, ['rev-parse', '--show-toplevel']);
  if (top.code) throw fail(home, 'find the repository', top);
  const root = top.stdout.trim();
  const branch = (await g(home, ['branch', '--show-current'])).stdout.trim();
  if (!branch) throw new BacklogError('SYNC_FAILED', 'check out a branch: the backlog is committed on the current branch', 2);
  const prefix = `${posix.join(...relative(realpathSync(root), realpathSync(home)).split(sep))}/`;
  let push = true; try { push = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'))['push-backlog-updates'] !== false; } catch { /* no configuration: the default is on */ }
  const remote = !(await g(home, ['remote', 'get-url', 'origin'])).code; // no origin remote: nothing to pull or push, the change is committed on the branch (exit 3 says so)
  return { root, branch, ref: `origin/${branch}`, cmp: `origin/${branch}`, prefix, clone: false, push, remote };
}

// `pull --autostash` exits 0 when applying the stash back conflicted: unmerged entries, or markers in the files. Nothing may ingest, stage or push
// that content; the clone is left as it is for the user (their edits are in the files and in 'git stash').
export async function refuseConflicts(home, t) {
  const unmerged = (await g(home, ['ls-files', '-u', '-z'])).stdout.split('\0').filter(Boolean).map(e => e.split('\t')[1]);
  const marked = (await g(home, ['grep', '-l', '-E', '^(<{7}|>{7})( |$)', '--', `${t.prefix}*${ITEM_EXT}`])).stdout.split('\n').filter(Boolean);
  const files = [...new Set([...unmerged, ...marked])];
  if (files.length) {
    throw new BacklogError('SYNC_FAILED', `${home} has unresolved conflicts after updating from ${t.ref} (${files.slice(0, 5).join(', ')}${files.length > 5 ? ', ...' : ''}); `
      + `nothing was read, changed or pushed. Resolve them (git -C ${home} status; the stashed edits are in 'git -C ${home} stash list'), then run the command again`, 3);
  }
}

// Only the commit created by this command may be repaired. Older versions/crashes
// can leave a stack: require an explicit publish/drop decision before touching it.
async function refuseUnpublished(home, t) {
  const commits = (await must(home, ['log', '--format=%h %s', `${t.ref}..HEAD`], 'list unpublished commits')).stdout.trim();
  if (commits) throw new BacklogError('SYNC_FAILED', `${home} has unpublished commits:\n${commits}\n`
    + `Nothing was changed. Publish them explicitly with 'git -C ${home} push origin HEAD:${t.branch}', or drop them with `
    + `'git -C ${home} reset --keep ${t.ref}', then retry. Resolve any divergence manually before publishing`, 3);
}

// The leading pull records pre-command edits, including staging. Keeping this in
// sync lets every mutating caller use the same rollback, including two-folder moves.
const starting = new Map();
const paths = r => r.stdout.split('\0').filter(Boolean);
async function snapshot(home) {
  const files = new Map();
  const dirty = paths(await must(home, ['diff', '--name-only', '--no-renames', '-z', 'HEAD'], 'list working edits'));
  const untracked = paths(await must(home, ['ls-files', '--others', '--exclude-standard', '-z'], 'list untracked files'));
  const staged = paths(await must(home, ['diff', '--cached', '--name-only', '--no-renames', '-z'], 'list staged edits'));
  for (const path of new Set([...dirty, ...untracked, ...staged])) {
    const abs = join(home, path);
    let st; try { st = lstatSync(abs); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    files.set(path, !st ? null : st.isSymbolicLink() ? { link: readlinkSync(abs) } : { bytes: readFileSync(abs), mode: st.mode });
  }
  const index = (await must(home, ['write-tree'], 'save staging')).stdout.trim();
  const head = (await g(home, ['rev-parse', '--verify', '-q', 'HEAD'])).stdout.trim();
  return { files, dirty, staged, index, head };
}

// Resolves to true when it committed. amend: the command's own commit is HEAD (a stack of the user's commits is never squashed).
async function foldIn(home, t, lits, subject, amend) {
  if (!lits.length) return false;
  if (t.clone && Number((await g(home, ['rev-list', '--count', `${t.ref}..HEAD`])).stdout.trim()) > 1) await refuseUnpublished(home, t); // never squash a stack with a partial folder list
  if (!(await g(home, ['diff', '--cached', '--quiet', '--', ...lits])).code) return false;
  const r = await commitOnly(home, lits, amend ? ['--amend', '--no-edit'] : ['-m', subject]);
  if (r.code) throw fail(home, 'commit the reconciled queue', r);
  return true;
}

// A pull that failed leaves nothing parked: the rebase is aborted and the autostash, if still set aside, is put back.
export async function abortPull(home) {
  await g(home, ['rebase', '--abort']);
  if (/autostash/i.test((await g(home, ['stash', 'list'])).stdout.split('\n')[0])) await g(home, ['stash', 'pop', '-q']);
}

async function pullLocked(t, read) {
  const home = t.root;
  await refuseConflicts(home, t);
  if (t.remote === false) { starting.set(resolve(home), await snapshot(home)); return; } // no origin remote: nothing to update from
  // A read whose update fails answers from the local copy with a warning; a write is refused: a write on a possibly stale view is what the stale guard exists to prevent.
  const unreachable = async why => {
    if (!read) throw new BacklogError('SYNC_FAILED', `could not update ${home} from ${t.ref} (${why.slice(0, 300)}); nothing was read or changed`, 3);
    process.stderr.write(`${OFFLINE}\n`);
    starting.set(resolve(home), await snapshot(home));
  };
  const fetched = await g(home, ['fetch', '-q', 'origin', refspec(t)]);
  if (fetched.code) {
    if ((await g(home, ['ls-remote', '--exit-code', '--heads', 'origin', t.branch])).code !== 2) return unreachable(fetched.stderr);
    starting.set(resolve(home), await snapshot(home)); // the origin has no such branch yet: nothing to pull, the first push creates it
    return;
  }
  if (t.clone) await refuseUnpublished(home, t);
  const before = await snapshot(home);
  const r = await g(home, pullArgs(t));
  if (r.code) {
    await abortPull(home);
    return unreachable(r.stderr);
  }
  await refuseConflicts(home, t);
  if (before.staged.length) await must(home, ['restore', '--staged', `--source=${before.index}`, '--', ...before.staged.map(lit)], 'restore your staging');
  starting.set(resolve(home), await snapshot(home));
}

// Both storage locations: update the repository that holds the items from its origin before anything is read or written.
// read: the command only reads, so an origin that cannot be reached is a warning, not a refusal.
export async function pull(home, { read = false } = {}) {
  if (!existsSync(home)) return; // nothing created yet
  const t = await target(home);
  return locked(lockFile(home), () => pullLocked(t, read), { takeOver: true });
}

const targetOf = (path, next) => posix.join(posix.dirname(path), pad(next) + posix.basename(path).replace(/^\d+/, ''));
const retagged = (item, next) => ({ // the item with its number changed in the phase/seq keys and the body heading
  fm: { ...item.fm, seq: next, ...(item.fm.phase && { phase: pad(next) + String(item.fm.phase).replace(/^\d+/, '') }) },
  body: item.body.replace(/^# Phase \d+/m, `# Phase ${pad(next)}`),
});

// The local side's own references follow its renumbered items: depends_on entries (number or slug) and "Split from `slug`" lines that the local
// commits added. A reference already in upstream's copy of the file is upstream's and keeps its number. moves: [{folder, old, slug, next, newSlug}],
// all applied at once, so a reference is never remapped twice.
function remapDoc(doc, base, moves) {
  const had = new Set(asList(base?.fm.depends_on));
  const hit = d => (had.has(String(d)) ? null : moves.find(m => (m.slug && m.slug === String(d)) || (/^\d+$/.test(String(d)) && Number(d) === m.old)));
  let changed = false;
  const deps = asList(doc.fm.depends_on).map(d => {
    const m = hit(d);
    if (!m) return /^\d+$/.test(d) ? Number(d) : d;
    changed = true;
    return /^\d+$/.test(String(d)) ? m.next : m.newSlug;
  });
  const pm = doc.fm.parent !== undefined && String(base?.fm.parent) !== String(doc.fm.parent) && moves.find(m => m.old === Number(doc.fm.parent));
  if (pm) changed = true;
  let body = doc.body;
  for (const m of moves) {
    const token = `Split from \`${m.slug}\``;
    if (m.slug && body.includes(token) && !(base?.body ?? '').includes(token)) { body = body.replaceAll(token, `Split from \`${m.newSlug}\``); changed = true; }
  }
  return changed ? { fm: { ...doc.fm, ...(doc.fm.depends_on === undefined ? {} : { depends_on: deps }), ...(pm ? { parent: pm.next } : {}) }, body } : null;
}

// Rewrites and stages, among `files` (paths from the clone root, changed by the local commits), those whose local references moved. Resolves to what it staged.
async function remapLocal(home, t, moves, files, baseRef, skip) {
  const touched = [];
  for (const file of files) {
    const [owner, repo] = file.slice(t.prefix.length).split('/');
    const here = moves.filter(m => m.folder === `${t.prefix}${owner}/${repo}`);
    const abs = join(home, file);
    if (!here.length || skip.has(file) || !itemFile(t).test(file) || !existsSync(abs)) continue;
    const b = await g(home, ['show', `${baseRef}:${file}`]);
    const next = remapDoc(parse(readItemText(abs)), b.code ? null : parse(b.stdout), here);
    if (!next) continue;
    store.write({ path: abs, ...next });
    await must(home, ['add', '--', lit(file)], `stage ${file}`);
    touched.push(file);
  }
  return touched;
}
const changedBy = async (home, range) => (await g(home, ['diff', '-z', '--no-renames', '--name-only', ...range])).stdout.split('\0').filter(Boolean);

// Files the unpushed commits added to any <owner>/<name>/phases or archive folder, renumbered when their seq is not above the upstream
// high-water mark (a number upstream published and deleted again is as taken as one it still holds) or is held by another file of the folder:
// git mv, phase/seq keys, body heading, amend. An item the commits only moved (archived: its file is also deleted from another place) keeps its number.
async function renumber(home, t, stream, committed) {
  const added = (await g(home, ['diff', '-z', '--no-renames', '--name-only', '--diff-filter=A', t.cmp, 'HEAD']))
    .stdout.split('\0').filter(f => itemFile(t).test(f));
  // Working edits (restored by the autostash) stay out of the repair, which stages and amends: stash them, pop them afterwards.
  const stashed = added.length > 0 && (await g(home, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim() !== '';
  if (stashed) await must(home, ['stash', 'push', '-q'], 'set your working edits aside');
  try { return await renumberFiles(home, t, stream, added, committed); } finally {
    if (stashed) {
      const r = await g(home, ['stash', 'pop', '-q']);
      if (r.code) throw new BacklogError('SYNC_FAILED', `could not restore your working edits in ${home} (${r.stderr.slice(0, 300)}); they are kept in 'git -C ${home} stash'`, 3);
    }
  }
}

async function renumberFiles(home, t, stream, added, committed) { // committed: the paths the renumbering writes are the command's own, as its undo needs to know
  const out = []; const moves = [];
  const gone = new Set((await g(home, ['diff', '-z', '--no-renames', '--name-only', '--diff-filter=D', t.cmp, 'HEAD'])).stdout.split('\0').filter(f => itemFile(t).test(f))
    .map(f => `${f.slice(t.prefix.length).split('/').slice(0, 2).join('/')}:${numberOf(posix.basename(f))}`));
  const marks = new Map(); // the upstream mark of each folder, read from the upstream ref only
  const upstreamMark = (name, folder) => { if (!marks.has(name)) marks.set(name, t.exists ? highWater(folder, { refs: [t.ref], tree: false }) : 0); return marks.get(name); };
  for (const file of added) {
    const [owner, repo, ...rest] = file.slice(t.prefix.length).split('/'); const name = `${t.prefix}${owner}/${repo}`; const path = rest.join('/');
    const folder = join(home, name);
    const items = store.load(folder);
    const mine = items.find(i => i.path === path);
    if (!mine) continue;
    const low = !gone.has(`${owner}/${repo}:${numberOf(posix.basename(path))}`) && Number(mine.fm.seq) <= upstreamMark(name, folder); // a moved item keeps its number: the mark (which a shallow clone cannot give) is read only for an added one
    if (!low && !items.some(i => i !== mine && Number(i.fm.seq) === Number(mine.fm.seq))) continue;
    const old = Number(mine.fm.seq); const next = store.nextSeqFor(folder, posix.basename(path).replace(/^\d+/, ''));
    const target = targetOf(path, next);
    await must(home, ['mv', `${name}/${path}`, `${name}/${target}`], `move ${path} to ${target}`);
    store.write({ path: join(folder, target), ...retagged(mine, next) });
    store.addEvent(folder, target, { event: 'renumber', before: mine.fm, note: `renumbered ${pad(old)} -> ${pad(next)}` });
    const counter = existsSync(join(folder, NUMBER_FILE)); // a folder that keeps a number record: it follows the new number
    if (counter) recordNumber(folder, next);
    for (const p of [`${name}/${path}`, `${name}/${target}`, ...(counter ? [`${name}/${NUMBER_FILE}`] : [])]) committed.add(p);
    await must(home, ['add', '--', lit(`${name}/${target}`), ...(counter ? [lit(`${name}/${NUMBER_FILE}`)] : [])], `stage ${target}`);
    const r = await commitOnly(home, [lit(`${name}/${path}`), lit(`${name}/${target}`), ...(counter ? [lit(`${name}/${NUMBER_FILE}`)] : [])], t.mine === false ? ['-m', 'backlog: renumbered'] : ['--amend', '--no-edit']);
    if (r.code) throw new BacklogError('SYNC_FAILED', `could not renumber ${path} to ${pad(next)} in ${home} (${r.stderr.slice(0, 300)})`, 3);
    stream.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
    out.push(pairOf(old, next, folder));
    const was = String(mine.fm.phase || itemSlugOfGitPath(path)); // an item without a phase field is named by its file
    moves.push({ folder: name, old, slug: was, next, newSlug: pad(next) + was.replace(/^\d+/, '') });
  }
  if (moves.length) { // the local dependents of the renumbered items follow them
    const touched = await remapLocal(home, t, moves, await changedBy(home, [t.cmp, 'HEAD']), t.cmp, new Set());
    if (touched.length) {
      for (const p of touched) committed.add(p);
      const r = await commitOnly(home, touched.map(lit), t.mine === false ? ['-m', 'backlog: renumbered'] : ['--amend', '--no-edit']);
      if (r.code) throw new BacklogError('SYNC_FAILED', `could not update the references to renumbered items in ${home} (${r.stderr.slice(0, 300)})`, 3);
    }
  }
  return out;
}

// A pull --rebase that stopped on conflicts of this folder only, which are repairable: add/add of item files (two clones created
// the same file name: the upstream file stays, the replayed local creation moves to nextSeq) and the index both clones changed
// (upstream's copy stands; the reconcile step after the pull makes it right against the merged items). The rebase goes on. false (the
// caller aborts) when anything else is in conflict or a step fails.
async function repairConflicts(home, t, folders, names, renumbered, committed) {
  const nameOf = path => names.findIndex(name => path.startsWith(`${name}/`));
  try {
    for (let round = 0; round < 20; round++) {
      const stages = new Map();
      for (const e of (await must(home, ['ls-files', '-u', '-z'], 'list conflicts')).stdout.split('\0').filter(Boolean)) {
        const [meta, path] = e.split('\t'); stages.set(path, `${stages.get(path) ?? ''}${meta.split(' ')[2]}`);
      }
      if (!stages.size) return false;
      const orders = new Set(); // the indexes both sides changed
      const counters = new Set(); // the number records both sides changed
      for (const [path, st] of stages) {
        if (['23', '123'].includes(st) && names.some(name => path === `${name}/index.json`)) { orders.add(path); continue; } // merged below, once the renumbering is known
        if (['23', '123', '12', '13'].includes(st) && names.some(name => path === `${name}/${NUMBER_FILE}`)) { counters.add(path); continue; } // every shape (both changed, added on both sides, deleted on one side and changed on the other): the larger value wins, below
        if (!['23', '123'].includes(st) || !itemFile(t).test(path) || nameOf(path) < 0) return false;
        if (st !== '23') return false; // a real edit of one item by both clones cannot be merged by number
      }
      // Every upstream file is restored before a number is allocated: nextSeq loads all items, and a file still holding conflict markers would not parse.
      const mines = new Map();
      for (const path of stages.keys()) {
        if (orders.has(path) || counters.has(path)) continue;

        mines.set(path, parse((await must(home, ['show', `:3:${path}`], `read ${path}`)).stdout));
        await must(home, ['checkout', '--ours', '--', lit(path)], `keep upstream ${path}`);
        await must(home, ['add', '--', lit(path)], `stage ${path}`);
      }
      const moves = []; const written = new Set();
      for (const [path, mine] of mines) {
        const name = names[nameOf(path)]; const folder = folders[nameOf(path)];
        const rel = path.slice(name.length + 1);
        const old = Number(mine.fm.seq); const next = store.nextSeqFor(folder, posix.basename(rel).replace(/^\d+/, '')); const target = targetOf(rel, next);
        store.write({ path: join(folder, target), ...retagged(mine, next) });
        store.addEvent(folder, target, { event: 'renumber', before: mine.fm, note: `renumbered ${pad(old)} -> ${pad(next)}` });
        await must(home, ['add', '--', lit(`${name}/${target}`)], `stage ${target}`);
        process.stdout.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
        renumbered.push(pairOf(old, next, folder));
        const was = String(mine.fm.phase || itemSlugOfGitPath(rel));
        moves.push({ folder: name, old, slug: was, next, newSlug: pad(next) + was.replace(/^\d+/, '') });
        written.add(`${name}/${target}`); committed.add(`${name}/${target}`);
      }
      const lastOf = async (path, n) => { const r = await g(home, ['show', `:${n}:${path}`]); try { return r.code ? 0 : Number(JSON.parse(r.stdout).last) || 0; } catch { return 0; } }; // one side of a conflicted record
      for (const name of new Set(moves.map(m => m.folder))) { // numbers.json holds the larger of both sides and the numbers given out here
        const path = `${name}/${NUMBER_FILE}`;
        const own = Math.max(...moves.filter(m => m.folder === name).map(m => m.next));
        if (counters.has(path)) writeFileSync(join(home, path), counterText(Math.max(own, await lastOf(path, 2), await lastOf(path, 3)))); else if (existsSync(join(home, path))) recordNumber(join(home, name), own); else continue;
        await must(home, ['add', '--', lit(path)], `stage ${path}`);
        counters.delete(path);
      }
      for (const path of counters) { // a conflicted record of a folder that renumbered nothing
        writeFileSync(join(home, path), counterText(Math.max(await lastOf(path, 2), await lastOf(path, 3))));
        await must(home, ['add', '--', lit(path)], `stage ${path}`);
      }
      for (const path of orders) { // upstream's order, with what the local side did to it done again
        const side = async n => { const r = await g(home, ['show', `:${n}:${path}`]); return r.code ? { branches: {} } : JSON.parse(r.stdout); };
        const name = path.slice(0, -'/index.json'.length);
        const renames = new Map(moves.filter(m => m.folder === name).map(m => [m.slug, m.newSlug]));
        writeFileSync(join(home, path), index.text(index.mergeOrders(await side(1), await side(2), await side(3), renames)));
        await must(home, ['add', '--', lit(path)], `stage ${path}`);
      }
      if (moves.length) for (const p of await remapLocal(home, t, moves, [...await changedBy(home, ['REBASE_HEAD^', 'REBASE_HEAD']), ...written], 'HEAD', new Set())) committed.add(p);
      for (const p of [...orders, ...counters]) committed.add(p);
      if (!(await g(home, ['-c', 'core.editor=true', 'rebase', '--continue'])).code) return true;
    }
  } catch { /* fall through: the caller aborts the rebase */ }
  return false;
}

// Validate the entire publication, including incidental reflow writes and both sides of a move,
// against the merged files after recovery. Added-file renumbering cannot protect existing --seq
// assignments or incoming references that another clone added while this command was publishing.
async function validatePublication(home, t, folders, names, claims, renumbered) {
  const delta = paths(await must(home, ['diff', '-z', '--no-renames', '--name-status', t.cmp, 'HEAD'], 'list publication writes'));
  const changed = new Map();
  for (let i = 0; i < delta.length; i += 2) changed.set(delta[i + 1], delta[i]);
  const reject = why => { throw new BacklogError('SYNC_FAILED', `The change was not published in ${home}: ${why}; the local branch and working tree were rolled back. Fix the cause and retry the command`, 3); };
  for (let n = 0; n < folders.length; n++) {
    const items = store.load(folders[n]);
    const prefix = `${names[n]}/`;
    const slug = i => i.fm.phase || itemSlug(i.path);
    const seq = i => Number(Object.hasOwn(i.fm, 'seq') ? i.fm.seq : 0);
    const find = d => items.find(i => /^\d+$/.test(String(d)) ? seq(i) === Number(d) : slug(i) === String(d));
    const resolves = d => (isForeign(d) ? Boolean(foreignItem(folders[n], d)) : Boolean(find(d))); // owner/name#seq
    const listed = Object.values(index.read(folders[n]).branches).flat().map(e => e.slug);
    const live = items.filter(i => i.path.startsWith('phases/')).map(slug);
    if (new Set(listed).size !== listed.length || live.length !== listed.length || live.some(s => !listed.includes(s))) reject(`${names[n]}: the index does not list every item of the folder once`);
    const leaves = items.some(i => asList(i.fm.depends_on).some(isForeign)); const others = new Map();
    const key = d => /^\d+$/.test(String(d)) ? String(Number(d)) : String(d);
    const lost = new Set();
    // Walk from every write, through unchanged/upstream and archived vertices too. A check of
    // just its outgoing edge cannot see a cycle completed by another publisher's edge.
    const checked = new Set(); const visiting = new Set();
    const acyclic = item => {
      if (visiting.has(item)) reject(`${names[n]}: dependency cycle through ${slug(item)}`);
      if (checked.has(item)) return;
      visiting.add(item);
      for (const d of asList(item.fm.depends_on)) {
        const target = find(d);
        if (target) acyclic(target);
      }
      visiting.delete(item); checked.add(item);
    };
    for (const [file, status] of changed) {
      if (!file.startsWith(prefix)) continue;
      const path = file.slice(prefix.length);
      if (!ITEM_PATH.test(path)) continue;
      const item = items.find(i => i.path === path);
      if (item) {
        const held = items.find(i => i !== item && seq(i) === seq(item));
        if (held) reject(`${names[n]}: seq ${item.fm.seq} of ${slug(item)} is already held by ${slug(held)}; the number must stay unique`);
        const sameSlug = items.find(i => i !== item && slug(i) === slug(item));
        if (sameSlug) reject(`${names[n]}: duplicate slug ${slug(item)} in ${item.path} and ${sameSlug.path}; the slug must stay unique`);
        for (const d of asList(item.fm.depends_on)) if (!resolves(d)) reject(`${names[n]}: ${item.fm.phase} depends on missing item ${d}`);
        acyclic(item);
        // a cycle through another repository leaves this one by an item with a foreign dependency
        if (leaves && foreignCycle(folders[n], names[n], seq(item), item.fm.depends_on, others)) reject(`${names[n]}: dependency cycle through another repository's items back to ${slug(item)}`);
      }
      if (status === 'A') continue; // a new item has no incoming identity to preserve
      const before = await must(home, ['show', `${t.cmp}:${file}`], `read the prior identity of ${file}`);
      let fm = {}; try { ({ fm } = parse(before.stdout)); } catch { /* the version on the origin cannot be read: this change is its repair */ }
      const priorSlug = fm.phase || itemSlug(file); // an item without a phase field is named by its file
      for (const d of [priorSlug, fm.seq]) if (d !== undefined && !resolves(d)) lost.add(key(d));
      // update --seq refuses incoming slug references as well as numeric ones, even though
      // a slug still resolves after a sequence-only change. Keep that pre-write rule after rebase.
      if (item && fm.seq !== undefined && Number(item.fm.seq) !== Number(fm.seq)) {
        for (const other of items) for (const d of asList(other.fm.depends_on)) {
          if (other !== item && (d === priorSlug || (/^\d+$/.test(d) && Number(d) === Number(fm.seq)))) {
            reject(`${names[n]}: ${slug(other)} depends on ${d}; clear or repoint incoming dependencies before changing its target's sequence`);
          }
        }
      }
    }
    // The source item may have disappeared from this folder, but its new upstream dependents
    // are outside the write set. Check them too before allowing any of the folders to publish.
    for (const item of items) for (const d of asList(item.fm.depends_on)) {
      if (lost.has(key(d))) {
        reject(`${names[n]}: ${item.fm.phase} depends on ${d}; removing or renumbering that item would leave its dependency missing`);
      }
    }
    // Claim eligibility depends on other files, so the target's stale guard alone cannot
    // protect it. Recheck the claim against the merged graph, preserving --force/reclaim policy.
    for (const claim of claims.filter(c => resolve(c.folder) === resolve(folders[n]))) {
      let path = claim.path;
      for (const pair of renumbered.filter(p => p.folder === undefined || p.folder === resolve(folders[n]))) {
        if (Number(basename(path).match(/^\d+/)?.[0]) === pair[0]) path = targetOf(path, pair[1]);
      }
      const item = items.find(i => i.path === path);
      if (!item) reject(`${names[n]}: claimed item ${path} disappeared`);
      const why = claim.verify?.({ item, items, folder: folders[n], name: names[n], find, slug });
      if (why) reject(`${names[n]}: ${why}`);
    }
  }
}

// The paths a command owns: the files it was given, and of each folder its item files, index.json and numbers.json that changed (plus the first-use
// configuration the store wrote itself). Never the folder root, the team file, the templates or an edit of .backlog/config.json.
export async function ownedPaths(home, t, names, files) {
  const out = new Set(); const gone = new Set(); // gone: a deletion already staged, which add has no path for
  for (let i = 0; i < names.length; i++) {
    if (files[i]) { out.add(names[i]); continue; }
    const rows = paths(await must(home, ['status', '--porcelain', '-z', '-uall', '--no-renames', '--', lit(names[i])], 'list the changes of the folder'));
    for (const row of rows) {
      const path = row.slice(3); const rest = path.slice(names[i].length + 1);
      if (ITEM_PATH.test(rest) || rest === 'index.json' || rest === NUMBER_FILE) { out.add(path); if (row.startsWith('D ')) gone.add(path); }
    }
  }
  if (!t.clone) { // the first use of a backlog inside the repository writes its configuration itself: only while it is not tracked yet (its creation); an edit of the committed file, such as the SHA, is a person's and never staged
    for (const row of paths(await must(home, ['status', '--porcelain', '-z', '--', ...['config.json', '.gitignore'].map(f => lit(t.prefix + f))], 'list the new configuration'))) {
      const file = row.slice(3);
      // only what the store wrote itself on first use: a hand-written file of the same name (a lead's draft) is never committed
      if (row.startsWith('?? ') && readFileSync(join(home, file), 'utf8') === (file.endsWith('config.json') ? store.FIRST_USE_CONFIG : store.FIRST_USE_IGNORE)) out.add(file);
    }
  }
  return { lits: [...out].map(lit), adds: [...out].filter(p => !gone.has(p)).map(lit) };
}

// The person's working version of `path` merged onto the upstream version it now has (index = HEAD). False when it conflicts: the version is then stashed.
export async function layOver(home, saved, path) {
  await g(home, ['restore', '-q', '--staged', '--source=HEAD', '--', lit(path)]);
  const abs = join(home, path);
  const theirs = await g(home, ['show', `HEAD:${path}`]);
  if (!existsSync(abs) || theirs.code) return true; // deleted by the person, or removed upstream: nothing to lay over
  const dir = mkdtempSync(join(tmpdir(), 'backlog-merge-'));
  try {
    const base = await g(home, ['show', `${saved.head}:${path}`]);
    writeFileSync(join(dir, 'mine'), readFileSync(abs)); writeFileSync(join(dir, 'base'), base.code ? '' : base.stdout); writeFileSync(join(dir, 'theirs'), theirs.stdout);
    const m = await g(home, ['merge-file', '-p', join(dir, 'mine'), join(dir, 'base'), join(dir, 'theirs')]);
    if (m.code === 0) { writeFileSync(abs, m.stdout); return true; }
    return (await g(home, ['stash', 'push', '-q', '-m', `backlog: your edit of ${path}, set aside because it conflicts with the pull`, '--', lit(path)])).code !== 0;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// The bytes the paths of `mine` had before the command ran (the person's own edit of such a path, or a file they had there). guard: a path that upstream
// changed since the snapshot is reported in `moved`, not in `wrote`: the caller lays the person's bytes over the upstream version (layOver).
export async function putBack(home, saved, mine, guard = false) {
  const wrote = []; const moved = [];
  for (const [path, prior] of saved?.files ?? []) {
    if (!mine.has(path)) continue;
    const changed = guard && prior && saved.head && (await g(home, ['diff', '--quiet', saved.head, 'HEAD', '--', lit(path)])).code;
    const abs = join(home, path);
    rmSync(abs, { force: true });
    if (prior) {
      mkdirSync(dirname(abs), { recursive: true });
      if (prior.link !== undefined) symlinkSync(prior.link, abs);
      else { writeFileSync(abs, prior.bytes); chmodSync(abs, prior.mode); }
      (changed ? moved : wrote).push(path);
    }
  }
  return { wrote, moved };
}

// After a command's commit was taken back (soft reset): its own paths go back to HEAD, a file it created is removed, a person's bytes are put back.
// Every other path is untouched. Resolves to { mine: the own paths, wrote, moved } (putBack's lists).
export async function restoreOwn(home, t, names, files, committed, saved, guard = false) {
  const mine = new Set([...committed, ...(await ownedPaths(home, t, names, files)).lits.map(l => l.slice(':(literal)'.length))]);
  const lits = [...mine].map(lit);
  const inHead = new Set(paths(await g(home, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', ...lits])));
  const known = [...mine].filter(p => inHead.has(p));
  const indexed = new Set(paths(await g(home, ['ls-files', '-z', '--', ...lits])));
  const unstage = [...mine].filter(p => inHead.has(p) || indexed.has(p));
  if (unstage.length) { // a branch with no commit yet (the command's was its first, taken back) has no HEAD to restore from
    if ((await g(home, ['rev-parse', '--verify', '-q', 'HEAD'])).stdout.trim()) await must(home, ['restore', '-q', '--staged', '--source=HEAD', '--', ...unstage.map(lit)], 'take back the unpublished change');
    else await must(home, ['rm', '-q', '--cached', '--ignore-unmatch', '--', ...unstage.map(lit)], 'take back the unpublished change');
  }
  if (known.length) await must(home, ['restore', '-q', '--worktree', '--source=HEAD', '--', ...known.map(lit)], 'take back the unpublished change');
  for (const path of mine) if (!inHead.has(path) && !saved?.files.has(path)) rmSync(join(home, path), { force: true }); // created by the command
  return { mine, ...await putBack(home, saved, mine, guard) };
}

export function takeStart(home) { const saved = starting.get(resolve(home)); starting.delete(resolve(home)); return saved; }

// The subject of the command's commit: one trimmed line (git stores a subject so, and the undo compares it).
export const commitSubject = (t, names, text) => (t.clone ? `${names.join(', ')}: ${text}` : `backlog: ${text}`).replace(/\s+/g, ' ').trim();

// True when HEAD is the command's own commit: it has the command's subject, changes at least one path, and every path it changes is one the
// command wrote (`committed`). Anything else on top is a person's commit and is never taken back, amended or published with the change.
export async function ownCommit(home, subject, committed) {
  const top = paths(await g(home, ['diff-tree', '--no-commit-id', '--name-only', '--root', '-r', '-z', 'HEAD']));
  return top.length > 0 && (await g(home, ['log', '-1', '--format=%s', 'HEAD'])).stdout.trim() === subject && top.every(p => committed.has(p));
}

// The words that name the command's kept commit and the two non-interactive ways out. The commit named is the first one with the command's
// subject whose every changed path is one the command wrote: a person's commit with the same subject is never named.
export async function keptParts(home, t, subject, committed) {
  let sha;
  for (const l of (await g(home, ['log', '--format=%h %s', t.clone ? `${t.ref}..HEAD` : '-20'])).stdout.split('\n')) {
    const at = l.indexOf(' ');
    if (l.slice(at + 1) !== subject) continue;
    const files = paths(await g(home, ['diff-tree', '--no-commit-id', '--name-only', '--root', '-r', '-z', l.slice(0, at)]));
    if (files.length && files.every(p => committed.has(p))) { sha = l.slice(0, at); break; }
  }
  const what = sha ? `the command's commit ${sha}` : `the command's commit (it could not be identified: see git -C ${home} log)`;
  const push = `git -C ${home} push origin HEAD:${t.branch}`;
  const advice = `publish with: ${push}${sha ? `  or take the command's change back with: git -C ${home} revert --no-edit ${sha}  and then publish with that push (if the revert stops on a conflict: git -C ${home} revert --abort, then publish with the push alone)` : ''}`;
  return { what, advice };
}

// Commits the folder's changes as "<owner>/<name>: <message>" and pushes them; resolves to the
// [old, new] pairs renumbered on the way. Recorded only when on origin/main.
// `folders`: one folder, or several of the same clone that change together (a cross-repository move): ONE commit, pushed once.
// `guard`: [{path (from the clone root), slug, was}] of the items this change rewrites on the strength of what the command read. When origin/main
// gains a change to one of them from someone else before the push, the commit is taken back (clone and index as before the command) and the command
// is refused with the stale-item message, never merged or parked on a side branch.
export async function commit(backlogHome, folders, message, reconcile = null, guard = [], claims = []) {
  const t = await target(backlogHome);
  const home = t.root; // git runs here; every path below is relative to it
  guard = publicationGuard(guard);
  const list = [].concat(folders);
  const names = [];
  for (const folder of list) names.push(t.prefix + (await assertInside(backlogHome, folder)).split(sep).join('/'));
  // a configuration file of the backlog root is committed with the folders but holds no items to check
  const isFile = f => existsSync(f) && lstatSync(f).isFile();
  const dirs = list.filter(f => !isFile(f)); const dirNames = names.filter((_, i) => !isFile(list[i]));
  // What a command stages and commits: the files it was given, and of each folder its item files, index.json and numbers.json that changed. Never the folder
  // root, the team file, the templates or .backlog/config.json, and never a pattern: a draft of a lead lying in the folder is not carried along.
  const files = list.map(isFile);
  const stage = async () => { // add -A with no path would stage everything
    const { lits, adds } = await ownedPaths(home, t, names, files);
    for (const l of lits) committed.add(l.slice(':(literal)'.length));
    if (adds.length) await must(home, ['add', '-A', '--', ...adds], `stage ${names.join(', ')}`);
    return lits;
  };
  const subject = commitSubject(t, names, message);
  const inBacklog = path => path.startsWith(t.prefix);
  const committed = new Set(); // every path the command staged, renumbered or repaired
  // The top commit is the command's own only when it has the command's subject and changes only paths the command wrote; anything else is a person's commit.
  const ownTop = () => ownCommit(home, subject, committed);
  return locked(lockFile(backlogHome), async () => {
    if (t.clone) await refuseUnpublished(home, t); // the user's own repository has its own unpushed commits: they are pushed with the change
    const saved = takeStart(home) ?? await snapshot(home);
    const restoreStaging = async paths => {
      if (paths.length) await must(home, ['restore', '--staged', `--source=${saved.index}`, '--', ...paths.map(lit)], 'restore your staging');
    };
    const undoCommit = async (target, cause) => {
      await g(home, ['rebase', '--abort']);
      const unmerged = paths(await g(home, ['ls-files', '-u', '-z'])).map(e => e.split('\t')[1]).filter((p, i, a) => a.indexOf(p) === i);
      if (unmerged.length) { // git refuses a soft reset in the middle of a merge: put the command's own files back and say what is left to do
        const sha = (await must(home, ['rev-parse', target], 'find the commit before the change')).stdout.trim();
        const mineSet = new Set(committed);
        const inTarget = new Set(paths(await g(home, ['ls-tree', '-r', '--name-only', '-z', sha, '--', ...[...mineSet].map(lit)])));
        const back = [...mineSet].filter(p => inTarget.has(p));
        if (back.length) await g(home, ['restore', '-q', `--source=${sha}`, '--staged', '--worktree', '--', ...back.map(lit)]);
        await putBack(home, saved, mineSet);
        for (const p of mineSet) if (!inTarget.has(p)) { await g(home, ['rm', '-q', '--cached', '--ignore-unmatch', '--', lit(p)]); rmSync(join(home, p), { force: true }); }
        const stash = (await g(home, ['stash', 'list'])).stdout.trim().split('\n').filter(Boolean)[0];
        const why = cause.message.replace(/[,;]? then run the command again\)?$/, '');
        throw new BacklogError('SYNC_FAILED', `The change was not published in ${home} (${why}), and your uncommitted edit of ${unmerged.slice(0, 5).join(', ')} conflicts with what was pulled, so the unpublished commit could not be taken back. `
          + `The files of the change are put back; your own edit is kept in the stash${stash ? ` (${stash})` : ''}. Next: resolve the conflicted files (git -C ${home} status), git add them, then run: git -C ${home} reset --soft ${sha}  and then run the command again`, 3);
      }
      await must(home, ['reset', '-q', '--soft', target], 'take back the unpublished change');
      // Only the command's own paths go back: a lead's uncommitted team file, the SHA in .backlog/config.json and a person's own edits stay.
      const { mine } = await restoreOwn(home, t, names, files, committed, saved);
      // The reset to the fetched upstream leaves what upstream changed elsewhere looking staged as reverted: those paths follow HEAD.
      const person = new Set([...saved.dirty, ...saved.staged, ...saved.files.keys()]);
      const stray = paths(await must(home, ['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD'], 'list the staged paths')).filter(p => !mine.has(p));
      if (stray.length) {
        const there = new Set(paths(await g(home, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', ...stray.map(lit)])));
        await must(home, ['restore', '-q', '--staged', '--source=HEAD', '--', ...stray.map(lit)], 'take back the unpublished change');
        const back = stray.filter(p => there.has(p) && !person.has(p)); // a person's own file stays as it is on disk
        if (back.length) await must(home, ['restore', '-q', '--worktree', '--source=HEAD', '--', ...back.map(lit)], 'take back the unpublished change');
      }
      // The person's own staging goes back as it was, except for a path upstream changed meanwhile: there the person's edit is laid over the upstream version.
      const own = [...new Set([...saved.dirty, ...saved.staged])].filter(inBacklog);
      const moved = [];
      for (const p of own) if (saved.head && (await g(home, ['diff', '--quiet', saved.head, 'HEAD', '--', lit(p)])).code === 1) moved.push(p);
      await restoreStaging(own.filter(p => !moved.includes(p)));
      const kept = [];
      for (const p of moved) if (!await layOver(home, saved, p)) kept.push(p);
      if (kept.length) cause.message += `; your edit of ${kept.join(', ')} conflicts with the upstream change and is kept in the stash (git -C ${home} stash list), the file itself is the upstream version`;
    };
    let mine = false; // the command's own commit is HEAD
    try {
      await refuseConflicts(home, t); // a rejected mutation must restore its starting files too
      const lits = await stage();
      // scoped to the owned files: work staged elsewhere in the backlog clone is neither committed nor pushed
      if (lits.length && (await g(home, ['diff', '--cached', '--quiet', '--', ...lits])).code) {
        const c = await commitOnly(home, lits, ['-m', subject]);
        if (c.code) throw new BacklogError('SYNC_FAILED', `could not commit in ${home} (${c.stderr.slice(0, 300)}); the change is not recorded`, 3);
        mine = true;
      }
      const renumbered = []; let err = ''; let settled = 0;
      const upstream = path => `${t.prefix}${path}`; // guard paths are from the backlog folder
      const staleHit = async () => { if (t.exists) for (const x of guard) if ((await g(home, ['diff', '--quiet', x.base || base, t.ref, '--', lit(upstream(x.path))])).code) return x; return null; };
      const staleCheck = async () => { // one refusal names every guarded item that changed upstream
        const hit = [];
        if (t.exists) for (const x of guard) if ((await g(home, ['diff', '--quiet', x.base || base, t.ref, '--', lit(upstream(x.path))])).code) hit.push(x);
        if (!hit.length) return;
        const upText = (await g(home, ['show', `${t.ref}:${upstream(hit[0].path)}`])).stdout;
        const up = parse(upText).fm;
        const repoOf = x => x.path.split('/').slice(0, 2).join('/');
        const repos = [...new Set([...guard.map(repoOf), ...names.map(n => n.slice(t.prefix.length))])]; // every folder of the publication (a move's destination too)
        const read = repos.flatMap(r => staleViews(join(backlogHome, ...r.split('/')), r, actor(), t.ref).map(slug => ({ repo: r, slug }))); // the other items the agent read that changed upstream
        throw staleError(hit[0].slug, up.updated_by, up.updated, hit[0].was, [...hit.map(x => ({ repo: repoOf(x), slug: x.slug })), ...read], repoOf(hit[0]), upText);
      };
      const base = (await g(home, ['merge-base', 'HEAD', t.ref])).stdout.trim();
      for (let i = 0; i < 3; i++) {
        await g(home, ['fetch', '-q', 'origin', refspec(t)]);
        // a branch the origin does not have yet has nothing to compare with or pull: the first push creates it
        t.exists = (await g(home, ['rev-parse', '--verify', '-q', t.ref])).code === 0;
        t.cmp = t.exists ? t.ref : EMPTY_TREE;
        await staleCheck();
        let pr = t.exists ? await g(home, pullArgs(t)) : { code: 0 };
        if (pr.code && guard.length && await staleHit()) { await g(home, ['rebase', '--abort']); await staleCheck(); } // a guarded item arrived with the pull and conflicts: refuse, never park
        if (pr.code && await repairConflicts(home, t, dirs, dirNames, renumbered, committed)) pr = { code: 0 };
        if (pr.code) {
          await g(home, ['rebase', '--abort']);
          err = `pull --rebase failed: ${pr.stderr.slice(0, 300)}`;
        } else {
          await refuseConflicts(home, t);
          await staleCheck();
          t.mine = mine && await ownTop(); // renumbering amends only the command's own commit; a user's unpushed commit, or one that landed on top, gets a commit of its own
          renumbered.push(...await renumber(home, t, process.stdout, committed));
          if (reconcile) { // the index is made right against the merged items in the commit itself: nothing inconsistent is ever pushed
            const fresh = renumbered.slice(settled);
            settled = renumbered.length;
            await reconcile(fresh);
            await staleCheck(); // reconciliation can add more incidental writes to the guard
            const amend = mine && await ownTop(); // a person's commit on top is never amended: the reconciled change becomes a commit of its own (never with the command's subject)
            mine = await foldIn(home, t, await stage(), mine && !amend ? `${subject}, index reconciled` : subject, amend) || mine;
          }
          await validatePublication(home, t, dirs, dirNames, claims, renumbered);
          await restoreStaging(saved.staged.filter(p => !committed.has(p)));
          if (t.push && t.remote === false && mine) { // the first release's behaviour is kept: the commit stays, the exit code says it was not published
            throw Object.assign(new BacklogError('SYNC_FAILED', `The change was not published from ${home} (no origin remote); it is committed on this branch: add the origin and push, then continue`, 3), { keep: true });
          }
          if (t.push && t.remote !== false) {
            // never publish a commit above the command's own: a person's commit on top stays (in the clone every unpublished commit is a person's, in the code repository the
            // branch is pushed as it is, what lay below the command's commit travels with it)
            const ahead = Number((await g(home, ['rev-list', '--count', `${t.ref}..HEAD`])).stdout.trim());
            if (ahead > 0 && (mine ? !await ownTop() : t.clone)) {
              const { what, advice } = mine ? await keptParts(home, t, subject, committed) : { what: '', advice: `publish with: git -C ${home} push origin HEAD:${t.branch}` };
              throw Object.assign(new BacklogError('SYNC_FAILED', `The change was not published in ${home}: your own commit appeared on the branch while the command ran. ${mine ? `${what[0].toUpperCase()}${what.slice(1)} is kept on the branch under your own commit and nothing was rolled back` : 'It is kept unpublished and nothing was rolled back'}. To finish, ${advice}`, 3), { keep: true });
            }
            const ps = await g(home, ['push', '-q', 'origin', `HEAD:refs/heads/${t.branch}`]);
            if (ps.code) { err = `push failed: ${ps.stderr.slice(0, 300)}`; if (i < 2) await delay(1000 * (1 + i)); continue; }
          }
          if (!t.clone && mine) announce(t, guard);
          return renumbered;
        }
        if (i < 2) await delay(1000 * (1 + i));
      }
      throw new BacklogError('SYNC_FAILED', `The change was not published in ${home} (${err}); the local branch and working tree were rolled back. Fix the cause and retry the command`, 3);
    } catch (e) {
      // A stale-view refusal keeps the established parent rollback (and exit 5).
      // Publication failures take back the command's own commit and nothing else.
      if (e.keep) throw e; // the commit is kept on purpose
      const stale = e.code === 'STALE_ITEM';
      const own = mine && await ownTop();
      const ahead = t.clone ? Number((await g(home, ['rev-list', '--count', `${t.ref}..HEAD`])).stdout.trim()) : 1;
      // clone: when nothing of a person's lies between the fetched remote and the command's commit, the branch also goes to the remote, as a failed pull needs
      const to = own ? (t.clone && ahead === 1 && !stale ? t.ref : 'HEAD~1') : t.clone && !stale && ahead === 0 ? t.ref : 'HEAD';
      if (mine && !own && ahead > 0) { // a person's commit lies on top of the command's: nothing is taken back, the text says so
        const { what, advice } = await keptParts(home, t, subject, committed);
        await undoCommit(to, e);
        if (stale) { e.message += `; your own commit lies on top of ${what}, which is kept unpublished on the branch: read the item again before publishing, then ${advice}`; throw e; }
        const cause = /has unpublished commits:/.test(e.message) ? 'your own commit appeared on the branch while the command ran' : e.message.replace(/[;,]? the local branch and working tree were rolled back.*$/s, '');
        throw new BacklogError('SYNC_FAILED', `${cause}. The change was not published; ${what} is kept on the branch under your own commit and nothing was rolled back. To finish, ${advice}`, 3);
      }
      await undoCommit(to, e);
      throw e;
    }
  }, { takeOver: true });
}

// sync.commit whose reconcile step makes the index of every folder right against the merged items (an item added by the other clone, a
// renumbered one) before the first push.
export const commitSettled = (home, folders, message, guard = [], claims = []) => {
  const list = [].concat(folders);
  return commit(home, list, message, fresh => { for (const folder of list) store.reflow(folder, { renames: index.renamesFor(folder, fresh) }); }, guard, claims);
};

// Inside the user's repository the branch is pushed as it is: say so after every change.
function announce(t, guard) {
  const slug = guard[0]?.slug ?? primarySlug();
  const [, id, name] = slug?.match(/^(\d+)-(.*)$/) ?? [];
  const what = slug ? `${id ?? slug}${name ? ` - ${name}` : ''} ` : '';
  const out = process.argv.includes('--json') ? process.stderr : process.stdout; // --json output stays parseable
  out.write(`✅ ${what}committed; ${t.push ? 'all pending branch changes pushed' : 'push is off (push-backlog-updates=false)'}\n`);
}
