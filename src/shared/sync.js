// Git sync of the shared backlog repository. Oracle:
// (pull before reading or writing) and 275-309 (commit and push after every change), the
// pinned ec5b254e. Node has no flock, so the lock is a pid file (locked of src/storage.js)
// and a number two clones picked at once is repaired after the rebase (renumber below).
// A failure to sync throws BacklogError with exitCode 3; the caller prints it and exits.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { locked } from '../storage.js';
import { assertInside, git as run, redact } from './safety.js';
import { parse } from './frontmatter.js';
import * as index from './index.js';
import { actor, primarySlug, publicationGuard, staleError, staleViews } from './seen.js';
import * as store from './store.js';
import { asList, foreignCycle, foreignItem, heldBy, isForeign } from './team.js';
import { wipRefusal } from './wip.js';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // what a branch the origin does not have yet is compared with: every file is new
const OFFLINE = '⚠️  origin offline, local backlog updates may be behind and need manual remediation later';
const pullArgs = t => ['pull', '-q', '--rebase', '--autostash', 'origin', t.branch]; // explicit: the checkout's tracking branch and push.default are the user's, not ours
const refspec = t => `+refs/heads/${t.branch}:refs/remotes/${t.ref}`;
const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad = n => String(n).padStart(3, '0');
// A renumbering is [old, new] of one repository folder: a number is only taken in its own folder, so a caller applies it to that folder alone.
const pairOf = (old, next, folder) => Object.defineProperty([old, next], 'folder', { value: resolve(folder) });
const lockFile = home => join(store.stateDir(home), 'smooth-backlog-cli.lock');
const itemFile = t => new RegExp(`^${esc(t.prefix)}[^/]+/[^/]+/(phases|archive)/.+\\.md$`); // an item file, from the root of the repository that holds it

// git in the backlog clone; an index.lock held by a git run outside the CLI is retried 5 times
//. Everything git says goes through redact: a URL may carry a token.
async function g(home, args) {
  let r;
  for (let i = 0; i < 5; i++) {
    if (i) await delay(500 * i);
    r = await run(args, home, { 'merge.directoryRenames': 'false' }); // a move that empties a folder must not drag another clone's new file along
    if (r.code === 0 || !r.stderr.includes('index.lock')) break;
  }
  return { ...r, stderr: redact(r.stderr).trim() };
}

// Git pathspecs are globs: ":(literal)" keeps a folder name such as acme/* from matching its siblings.
const lit = path => `:(literal)${path}`;
// Every commit, including recovery squashes and amendments, leaves unrelated index entries alone.
const commitOnly = (home, lits, options) => g(home, ['commit', '-q', ...options, '--only', '--', ...lits]);
const fail = (home, what, r) => new BacklogError('SYNC_FAILED', `could not ${what} in ${home} (${r.stderr.slice(0, 300)}); the change is not recorded`, 3);
const must = async (home, args, what) => { const r = await g(home, args); if (r.code) throw fail(home, what, r); return r; };

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
async function refuseConflicts(home, t) {
  const unmerged = (await g(home, ['ls-files', '-u', '-z'])).stdout.split('\0').filter(Boolean).map(e => e.split('\t')[1]);
  const marked = (await g(home, ['grep', '-l', '-E', '^(<{7}|>{7})( |$)', '--', `${t.prefix}*.md`])).stdout.split('\n').filter(Boolean);
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
  return { files, dirty, staged, index };
}

// Resolves to true when it committed. amend: the command's own commit is HEAD (a stack of the user's commits is never squashed).
async function foldIn(home, t, lits, subject, amend) {
  if (t.clone && Number((await g(home, ['rev-list', '--count', `${t.ref}..HEAD`])).stdout.trim()) > 1) await refuseUnpublished(home, t); // never squash a stack with a partial folder list
  if (!(await g(home, ['diff', '--cached', '--quiet', '--', ...lits])).code) return false;
  const r = await commitOnly(home, lits, amend ? ['--amend', '--no-edit'] : ['-m', subject]);
  if (r.code) throw fail(home, 'commit the reconciled queue', r);
  return true;
}

// A pull that failed leaves nothing parked: the rebase is aborted and the autostash, if still set aside, is put back.
async function abortPull(home) {
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
  let body = doc.body;
  for (const m of moves) {
    const token = `Split from \`${m.slug}\``;
    if (m.slug && body.includes(token) && !(base?.body ?? '').includes(token)) { body = body.replaceAll(token, `Split from \`${m.newSlug}\``); changed = true; }
  }
  return changed ? { fm: { ...doc.fm, ...(doc.fm.depends_on === undefined ? {} : { depends_on: deps }) }, body } : null;
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
    const next = remapDoc(parse(readFileSync(abs, 'utf8')), b.code ? null : parse(b.stdout), here);
    if (!next) continue;
    store.write({ path: abs, ...next });
    await must(home, ['add', '--', lit(file)], `stage ${file}`);
    touched.push(file);
  }
  return touched;
}
const changedBy = async (home, range) => (await g(home, ['diff', '-z', '--no-renames', '--name-only', ...range])).stdout.split('\0').filter(Boolean);

// Files the unpushed commits added to any <owner>/<name>/phases or archive folder, renumbered when their
// seq is already held by another file of the folder: git mv, phase/seq keys, body heading, amend.
async function renumber(home, t, stream) {
  const added = (await g(home, ['diff', '-z', '--no-renames', '--name-only', '--diff-filter=A', t.cmp, 'HEAD']))
    .stdout.split('\0').filter(f => itemFile(t).test(f));
  // Working edits (restored by the autostash) stay out of the repair, which stages and amends: stash them, pop them afterwards.
  const stashed = added.length > 0 && (await g(home, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim() !== '';
  if (stashed) await must(home, ['stash', 'push', '-q'], 'set your working edits aside');
  try { return await renumberFiles(home, t, stream, added); } finally {
    if (stashed) {
      const r = await g(home, ['stash', 'pop', '-q']);
      if (r.code) throw new BacklogError('SYNC_FAILED', `could not restore your working edits in ${home} (${r.stderr.slice(0, 300)}); they are kept in 'git -C ${home} stash'`, 3);
    }
  }
}

async function renumberFiles(home, t, stream, added) {
  const out = []; const moves = [];
  for (const file of added) {
    const [owner, repo, ...rest] = file.slice(t.prefix.length).split('/'); const name = `${t.prefix}${owner}/${repo}`; const path = rest.join('/');
    const folder = join(home, name);
    const items = store.load(folder);
    const mine = items.find(i => i.path === path);
    if (!mine || !items.some(i => i !== mine && Number(i.fm.seq) === Number(mine.fm.seq))) continue;
    const old = Number(mine.fm.seq); const next = store.nextSeqFor(folder, posix.basename(path).replace(/^\d+/, ''));
    const target = targetOf(path, next);
    await must(home, ['mv', `${name}/${path}`, `${name}/${target}`], `move ${path} to ${target}`);
    store.write({ path: join(folder, target), ...retagged(mine, next) });
    store.addEvent(folder, target, { event: 'renumbered', branch: mine.fm.branch || '', note: `${pad(old)} -> ${pad(next)}` });
    await must(home, ['add', '--', lit(`${name}/${target}`)], `stage ${target}`);
    const r = await commitOnly(home, [lit(name)], t.mine === false ? ['-m', 'backlog: renumbered'] : ['--amend', '--no-edit']);
    if (r.code) throw new BacklogError('SYNC_FAILED', `could not renumber ${path} to ${pad(next)} in ${home} (${r.stderr.slice(0, 300)})`, 3);
    stream.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
    out.push(pairOf(old, next, folder));
    const was = String(mine.fm.phase || posix.basename(path, '.md')); // an item without a phase field is named by its file
    moves.push({ folder: name, old, slug: was, next, newSlug: pad(next) + was.replace(/^\d+/, '') });
  }
  if (moves.length) { // the local dependents of the renumbered items follow them
    const touched = await remapLocal(home, t, moves, await changedBy(home, [t.cmp, 'HEAD']), t.cmp, new Set());
    if (touched.length) {
      const lits = [...new Set(touched.map(f => f.slice(t.prefix.length).split('/').slice(0, 2).join('/')))].map(f => lit(t.prefix + f));
      const r = await commitOnly(home, lits, t.mine === false ? ['-m', 'backlog: renumbered'] : ['--amend', '--no-edit']);
      if (r.code) throw new BacklogError('SYNC_FAILED', `could not update the references to renumbered items in ${home} (${r.stderr.slice(0, 300)})`, 3);
    }
  }
  return out;
}

// A pull --rebase that stopped on conflicts of this folder only, which are repairable: add/add of item files (two clones created
// the same file name: the upstream file stays, the replayed local creation moves to nextSeq) and the index both clones changed
// (upstream's copy stands; the reconcile step after the pull makes it right against the merged items). The rebase goes on. false (the
// caller aborts) when anything else is in conflict or a step fails.
async function repairConflicts(home, t, folders, names, renumbered) {
  const nameOf = path => names.findIndex(name => path.startsWith(`${name}/`));
  try {
    for (let round = 0; round < 20; round++) {
      const stages = new Map();
      for (const e of (await must(home, ['ls-files', '-u', '-z'], 'list conflicts')).stdout.split('\0').filter(Boolean)) {
        const [meta, path] = e.split('\t'); stages.set(path, `${stages.get(path) ?? ''}${meta.split(' ')[2]}`);
      }
      if (!stages.size) return false;
      const orders = new Set(); // the indexes both sides changed
      for (const [path, st] of stages) {
        if (['23', '123'].includes(st) && names.some(name => path === `${name}/index.json`)) { orders.add(path); continue; } // merged below, once the renumbering is known
        if (!['23', '123'].includes(st) || !itemFile(t).test(path) || nameOf(path) < 0) return false;
        if (st !== '23') return false; // a real edit of one item by both clones cannot be merged by number
      }
      // Every upstream file is restored before a number is allocated: nextSeq loads all items, and a file still holding conflict markers would not parse.
      const mines = new Map();
      for (const path of stages.keys()) {
        if (orders.has(path)) continue;

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
        store.addEvent(folder, target, { event: 'renumbered', branch: mine.fm.branch || '', note: `${pad(old)} -> ${pad(next)}` });
        await must(home, ['add', '--', lit(`${name}/${target}`)], `stage ${target}`);
        process.stdout.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
        renumbered.push(pairOf(old, next, folder));
        const was = String(mine.fm.phase || posix.basename(rel, '.md'));
        moves.push({ folder: name, old, slug: was, next, newSlug: pad(next) + was.replace(/^\d+/, '') });
        written.add(`${name}/${target}`);
      }
      for (const path of orders) { // upstream's order, with what the local side did to it done again
        const side = async n => { const r = await g(home, ['show', `:${n}:${path}`]); return r.code ? { branches: {} } : JSON.parse(r.stdout); };
        const name = path.slice(0, -'/index.json'.length);
        const renames = new Map(moves.filter(m => m.folder === name).map(m => [m.slug, m.newSlug]));
        writeFileSync(join(home, path), index.text(index.mergeOrders(await side(1), await side(2), await side(3), renames)));
        await must(home, ['add', '--', lit(path)], `stage ${path}`);
      }
      if (moves.length) await remapLocal(home, t, moves, [...await changedBy(home, ['REBASE_HEAD^', 'REBASE_HEAD']), ...written], 'HEAD', new Set());
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
    const slug = i => i.fm.phase || basename(i.path, '.md');
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
      if (!/^(phases\/[^/]+|archive\/.+)\.md$/.test(path)) continue;
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
      const priorSlug = fm.phase || basename(file, '.md'); // an item without a phase field is named by its file
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
      for (const d of asList(item.fm.depends_on)) {
        const target = isForeign(d) ? foreignItem(folders[n], d) : find(d);
        if (!target || !['done', 'archived'].includes(isForeign(d) ? target.status : target.fm.status)) reject(`${names[n]}: ${slug(item)} dependencies not done: ${d}`);
      }
      const wip = claim.reclaim ? null : wipRefusal(folders[n], names[n], item.fm, claim.agent, slug(item)); // a concurrent start elsewhere counts
      if (wip) reject(`${names[n]}: ${slug(item)}: ${wip}`);
      if (!claim.skipActiveLimit) {
        // items held by an earlier session of the same card count (the continuation keeps the
        // one-active-item rule across the card's sessions)
        const held = items.filter(i => i !== item && i.path.startsWith('phases/') && ['pending', 'in_progress'].includes(i.fm.status ?? 'pending')
          && heldBy(i.fm.claimed_by, claim.agent) && !['requested', 'in_review'].includes(i.fm.review_state) && !i.fm.wait_on);
        if (held.length) reject(`${names[n]}: ${claim.agent} holds ${held.length} active item(s): ${held.map(slug).join(', ')}; pull new work only when every item you hold waits; --force overrides`);
      }
    }
  }
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
  // the backlog repository: the item folders. The user's repository: the whole .backlog folder (its configuration is committed with the items), nothing else
  const lits = t.clone ? names.map(lit) : [lit(t.prefix.slice(0, -1))];
  const subject = t.clone ? `${names.join(', ')}: ${message}` : `backlog: ${message}`;
  const inBacklog = path => path.startsWith(t.prefix);
  return locked(lockFile(backlogHome), async () => {
    if (t.clone) await refuseUnpublished(home, t); // the user's own repository has its own unpushed commits: they are pushed with the change
    const saved = starting.get(resolve(home)) ?? await snapshot(home);
    starting.delete(resolve(home));
    const own = path => (t.clone ? names.some(n => path === n || path.startsWith(`${n}/`)) : inBacklog(path));
    const restoreStaging = async paths => {
      if (paths.length) await must(home, ['restore', '--staged', `--source=${saved.index}`, '--', ...paths.map(lit)], 'restore your staging');
    };
    // Only the backlog's paths are put back (the whole clone when it is the backlog repository): the user's other files are not touched.
    const backlogDir = join(home, t.prefix);
    const undoCommit = async target => {
      await g(home, ['rebase', '--abort']);
      await must(home, ['reset', '-q', '--soft', target], 'take back the unpublished change');
      if ((await g(backlogDir, ['ls-files'])).stdout.trim()) {
        await must(backlogDir, ['restore', '-q', '--staged', '--worktree', '--source=HEAD', '--', '.'], 'take back the unpublished change');
      }
      // Reconciliation can fail before staging its new files.
      for (const path of paths(await g(backlogDir, ['ls-files', '--others', '--exclude-standard', '--full-name', '-z']))) {
        if (own(path) && !saved.files.has(path)) rmSync(join(home, path), { force: true });
      }
      for (const [path, prior] of saved.files) {
        if (!inBacklog(path)) continue;
        const abs = join(home, path);
        rmSync(abs, { force: true });
        if (prior) {
          mkdirSync(dirname(abs), { recursive: true });
          if (prior.link !== undefined) symlinkSync(prior.link, abs);
          else { writeFileSync(abs, prior.bytes); chmodSync(abs, prior.mode); }
        }
      }
      await restoreStaging([...new Set([...saved.dirty, ...saved.staged])].filter(inBacklog));
    };
    let mine = false; // the command's own commit is HEAD
    try {
      await refuseConflicts(home, t); // a rejected mutation must restore its starting files too
      await must(home, ['add', '-A', '--', ...lits], `stage ${names.join(', ')}`);
      // scoped to the folders: work staged elsewhere in the backlog clone is neither committed nor pushed
      if ((await g(home, ['diff', '--cached', '--quiet', '--', ...lits])).code) {
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
        if (pr.code && await repairConflicts(home, t, list, names, renumbered)) pr = { code: 0 };
        if (pr.code) {
          await g(home, ['rebase', '--abort']);
          err = `pull --rebase failed: ${pr.stderr.slice(0, 300)}`;
        } else {
          await refuseConflicts(home, t);
          await staleCheck();
          t.mine = mine; // renumbering amends only the command's own commit; a user's unpushed commit gets a commit of its own
          renumbered.push(...await renumber(home, t, process.stdout));
          if (reconcile) { // the index is made right against the merged items in the commit itself: nothing inconsistent is ever pushed
            const fresh = renumbered.slice(settled);
            settled = renumbered.length;
            await reconcile(fresh);
            await staleCheck(); // reconciliation can add more incidental writes to the guard
            await must(home, ['add', '-A', '--', ...lits], `stage ${names.join(', ')}`);
            mine = await foldIn(home, t, lits, subject, mine) || mine;
          }
          await validatePublication(home, t, list, names, claims, renumbered);
          await restoreStaging(saved.staged.filter(p => !own(p)));
          if (t.push && t.remote === false && mine) { // the first release's behaviour is kept: the commit stays, the exit code says it was not published
            throw Object.assign(new BacklogError('SYNC_FAILED', `The change was not published from ${home} (no origin remote); it is committed on this branch: add the origin and push, then continue`, 3), { keep: true });
          }
          if (t.push && t.remote !== false) {
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
      // Publication failures return the branch to the fetched remote instead; in the user's repository, to the commit before the command's own.
      if (e.keep) throw e; // the commit is kept on purpose
      const stale = e.code === 'STALE_ITEM';
      let to = mine ? 'HEAD~1' : 'HEAD';
      if (t.clone) {
        const ahead = stale && Number((await g(home, ['rev-list', '--count', `${t.ref}..HEAD`])).stdout.trim()) > 0;
        to = stale ? (ahead ? 'HEAD~1' : 'HEAD') : t.ref;
      }
      await undoCommit(to);
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
