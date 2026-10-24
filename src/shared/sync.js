// Git sync of the shared backlog repository (cli-parity job 8). Oracle: lib_db.py:101-110
// (pull before reading or writing) and 275-309 (commit and push after every change), the
// pinned ec5b254e. Node has no flock, so the lock is a pid file (locked() of src/storage.js)
// and a number two clones picked at once is repaired after the rebase (renumber below).
// A failure to sync throws BacklogError with exitCode 3; the caller prints it and exits.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { join, posix, resolve, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { locked } from '../storage.js';
import { assertInside, git as run, redact } from './safety.js';
import { parse } from './frontmatter.js';
import { connect, scan } from './db.js';
import * as store from './store.js';

const PULL = ['pull', '-q', '--rebase', '--autostash'];
const pad = n => String(n).padStart(3, '0');
// A renumbering is [old, new] of one repository folder: a number is only taken in its own folder, so a caller applies it to that folder alone.
const pairOf = (old, next, folder) => Object.defineProperty([old, next], 'folder', { value: resolve(folder) });
const lockFile = home => join(home, '.git', 'smooth-backlog-cli.lock');

// git in the backlog clone; an index.lock held by a git run outside the CLI is retried 5 times
// (lib_db.py:287-294). Everything git says goes through redact: a URL may carry a token.
async function g(home, args) {
  let r;
  for (let i = 0; i < 5; i++) {
    if (i) await delay(500 * i);
    r = await run(['-c', 'merge.directoryRenames=false', ...args], home); // a move that empties a folder must not drag another clone's new file along
    if (r.code === 0 || !r.stderr.includes('index.lock')) break;
  }
  return { ...r, stderr: redact(r.stderr).trim() };
}

// Git pathspecs are globs: ":(literal)" keeps a folder name such as acme/* from matching its siblings.
const lit = path => `:(literal)${path}`;
const fail = (home, what, r) => new BacklogError('SYNC_FAILED', `could not ${what} in ${home} (${r.stderr.slice(0, 300)}); the change is not recorded`, 3);
const must = async (home, args, what) => { const r = await g(home, args); if (r.code) throw fail(home, what, r); return r; };

// `pull --autostash` exits 0 when applying the stash back conflicted: unmerged entries, or markers in the files. Nothing may ingest, stage or push
// that content; the clone is left as it is for the user (their edits are in the files and in 'git stash').
async function refuseConflicts(home) {
  const unmerged = (await g(home, ['ls-files', '-u', '-z'])).stdout.split('\0').filter(Boolean).map(e => e.split('\t')[1]);
  const marked = (await g(home, ['grep', '-l', '-E', '^(<{7}|>{7})( |$)', '--', '*.md'])).stdout.split('\n').filter(Boolean);
  const files = [...new Set([...unmerged, ...marked])];
  if (files.length) {
    throw new BacklogError('SYNC_FAILED', `${home} has unresolved conflicts after updating from origin/main (${files.slice(0, 5).join(', ')}${files.length > 5 ? ', ...' : ''}); `
      + `nothing was read, changed or pushed. Resolve them (git -C ${home} status; the stashed edits are in 'git -C ${home} stash list'), then run the command again`, 3);
  }
}

async function pullLocked(home) {
  const r = await g(home, PULL);
  if (!r.code) await refuseConflicts(home);
  if (!r.code) { await renumber(home, process.stderr, true); return; } // stderr: a read command's stdout may be JSON
  await g(home, ['rebase', '--abort']);
  throw new BacklogError('SYNC_FAILED', `could not update ${home} from origin/main (${r.stderr.slice(0, 300)}); nothing was read or changed, `
    + 'because the local copy may be stale. Fix the cause, then run the command again', 3); // lib_db.py:106-109
}

export const pull = home => locked(lockFile(home), () => pullLocked(home), { takeOver: true });

const targetOf = (path, next) => posix.join(posix.dirname(path), pad(next) + posix.basename(path).replace(/^\d+/, ''));
const retagged = (item, next) => ({ // the item with its number changed in the phase/seq keys and the body heading
  fm: { ...item.fm, seq: next, ...(item.fm.phase && { phase: pad(next) + String(item.fm.phase).replace(/^\d+/, '') }) },
  body: item.body.replace(/^# Phase \d+/m, `# Phase ${pad(next)}`),
});

// Files the unpushed commits added to any <owner>/<name>/phases or archive folder, renumbered when their
// seq is already held by another file of the folder: git mv, phase/seq keys, body heading, amend.
async function renumber(home, stream, mirror = false) {
  const added = (await g(home, ['diff', '-z', '--no-renames', '--name-only', '--diff-filter=A', '@{u}', 'HEAD']))
    .stdout.split('\0').filter(f => /^[^/]+\/[^/]+\/(phases|archive)\/.+\.md$/.test(f));
  // Working edits (restored by the autostash) stay out of the repair, which stages and amends: stash them, pop them afterwards.
  const stashed = added.length > 0 && (await g(home, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim() !== '';
  if (stashed) await must(home, ['stash', 'push', '-q'], 'set your working edits aside');
  try { return await renumberFiles(home, stream, added, mirror); } finally {
    if (stashed) {
      const r = await g(home, ['stash', 'pop', '-q']);
      if (r.code) throw new BacklogError('SYNC_FAILED', `could not restore your working edits in ${home} (${r.stderr.slice(0, 300)}); they are kept in 'git -C ${home} stash'`, 3);
    }
  }
}

async function renumberFiles(home, stream, added, mirror) {
  const out = [];
  for (const file of added) {
    const [owner, repo, ...rest] = file.split('/'); const name = `${owner}/${repo}`; const path = rest.join('/');
    const folder = join(home, owner, repo);
    const items = store.load(folder);
    const mine = items.find(i => i.path === path);
    if (!mine || !items.some(i => i !== mine && Number(i.fm.seq) === Number(mine.fm.seq))) continue;
    const old = Number(mine.fm.seq); const next = store.nextSeq(folder);
    const target = targetOf(path, next);
    await must(home, ['mv', `${name}/${path}`, `${name}/${target}`], `move ${path} to ${target}`);
    store.write({ path: join(folder, target), ...retagged(mine, next) });
    await must(home, ['add', '--', lit(`${name}/${target}`)], `stage ${target}`);
    if (mirror) { // a pull has no caller that rescans (commit's callers do): the commit's backlog.db still holds the row under the old
      // number, so rename it in place now; no later scan then reads the old file as missing and the new one as a second item
      const con = connect(folder);
      try { scan(con, folder, [[old, next]]); } finally { con.close(); }
      await must(home, ['add', '--', lit(`${name}/backlog.db`)], `stage ${name}/backlog.db`);
    }
    const r = await g(home, ['commit', '-q', '--amend', '--no-edit']);
    if (r.code) throw new BacklogError('SYNC_FAILED', `could not renumber ${path} to ${pad(next)} in ${home} (${r.stderr.slice(0, 300)})`, 3);
    stream.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
    out.push(pairOf(old, next, folder));
  }
  return out;
}

// A pull --rebase that stopped on conflicts of this folder only, which are repairable: add/add of item files (two clones created
// the same file name: the upstream file stays, the replayed local creation moves to nextSeq) and the binary mirror backlog.db
// (two writers changed it: upstream's copy is taken, since the mirror is derived from the files; the caller rescans it from the files
// afterwards, which `renumbered.mirror` asks for; renumbered.localDbs lists copies of the local db and of the merge base, to replay the local changes onto it). The rebase goes on. false (the caller aborts) when anything else is in conflict or a step fails.
async function repairConflicts(home, folders, names, renumbered) {
  const dbPaths = names.map(name => `${name}/backlog.db`);
  const nameOf = path => names.findIndex(name => path.startsWith(`${name}/`));
  try {
    for (let round = 0; round < 20; round++) {
      const stages = new Map();
      for (const e of (await must(home, ['ls-files', '-u', '-z'], 'list conflicts')).stdout.split('\0').filter(Boolean)) {
        const [meta, path] = e.split('\t'); stages.set(path, `${stages.get(path) ?? ''}${meta.split(' ')[2]}`);
      }
      if (!stages.size || [...stages].some(([path, st]) => (dbPaths.includes(path) ? !st.includes('2')
        : st !== '23' || !/^[^/]+\/[^/]+\/(phases|archive)\/.+\.md$/.test(path) || nameOf(path) < 0))) return false;
      for (const dbPath of dbPaths) if (stages.has(dbPath)) {
        // the local db and the merge base go aside first: db.replayLocal replays the local side's own changes onto upstream's copy
        if (stages.get(dbPath).includes('3')) {
          const dir = mkdtempSync(join(tmpdir(), 'backlog-localdb-'));
          const aside = async (n, file) => {
            const tmp = (await must(home, ['checkout-index', `--stage=${n}`, '--temp', '--', dbPath], `read stage ${n} of ${dbPath}`)).stdout.split('\t')[0];
            copyFileSync(join(home, tmp), join(dir, file)); rmSync(join(home, tmp));
            return join(dir, file);
          };
          const local = await aside(3, 'backlog.db');
          (renumbered.localDbs ??= []).push({ folder: folders[dbPaths.indexOf(dbPath)], local, base: stages.get(dbPath).includes('1') ? await aside(1, 'base.db') : null });
        }
        await must(home, ['checkout', '--ours', '--', lit(dbPath)], `keep upstream ${dbPath}`);
        await must(home, ['add', '--', lit(dbPath)], `stage ${dbPath}`);
        renumbered.mirror = true;
      }
      // Every upstream file is restored before a number is allocated: nextSeq loads all items, and a file still holding conflict markers would not parse.
      const mines = new Map();
      for (const path of stages.keys()) {
        if (dbPaths.includes(path)) continue;
        mines.set(path, parse((await must(home, ['show', `:3:${path}`], `read ${path}`)).stdout));
        await must(home, ['checkout', '--ours', '--', lit(path)], `keep upstream ${path}`);
        await must(home, ['add', '--', lit(path)], `stage ${path}`);
      }
      for (const [path, mine] of mines) {
        const name = names[nameOf(path)]; const folder = folders[nameOf(path)];
        const rel = path.slice(name.length + 1);
        const old = Number(mine.fm.seq); const next = store.nextSeq(folder); const target = targetOf(rel, next);
        store.write({ path: join(folder, target), ...retagged(mine, next) });
        await must(home, ['add', '--', lit(`${name}/${target}`)], `stage ${target}`);
        process.stdout.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
        renumbered.push(pairOf(old, next, folder));
      }
      if (!(await g(home, ['-c', 'core.editor=true', 'rebase', '--continue'])).code) return true;
    }
  } catch { /* fall through: the caller aborts the rebase */ }
  return false;
}

// Commits the folder's changes as "<owner>/<name>: <message>" and pushes them; resolves to the
// [old, new] pairs renumbered on the way (with .mirror = true when backlog.db was taken from upstream: rescan it and commit again). Recorded only when on origin/main (lib_db.py:275-309).
// `folders`: one folder, or several of the same clone that change together (a cross-repository move): ONE commit, pushed once.
export async function commit(home, folders, message) {
  const list = [].concat(folders);
  const names = [];
  for (const folder of list) names.push((await assertInside(home, folder)).split(sep).join('/'));
  const lits = names.map(lit);
  return locked(lockFile(home), async () => {
    await refuseConflicts(home); // never stage or push the markers of an autostash that did not apply
    await must(home, ['add', '-A', '--', ...lits], `stage ${names.join(', ')}`);
    // scoped to the folders (beyond lib_db.py parity): work staged elsewhere in the backlog clone is neither committed nor pushed
    if ((await g(home, ['diff', '--cached', '--quiet', '--', ...lits])).code) {
      const c = await g(home, ['commit', '-q', '--only', '-m', `${names.join(', ')}: ${message}`, '--', ...lits]);
      if (c.code) throw new BacklogError('SYNC_FAILED', `could not commit in ${home} (${c.stderr.slice(0, 300)}); the change is not recorded`, 3);
    }
    const renumbered = []; let err = '';
    for (let i = 0; i < 3; i++) {
      let pr = await g(home, PULL);
      if (pr.code && await repairConflicts(home, list, names, renumbered)) pr = { code: 0 };
      if (pr.code) {
        await g(home, ['rebase', '--abort']);
        err = `pull --rebase failed: ${pr.stderr.slice(0, 300)}`;
      } else {
        await refuseConflicts(home);
        renumbered.push(...await renumber(home, process.stdout));
        const ps = await g(home, ['push', '-q']);
        if (!ps.code) return renumbered;
        err = `push failed: ${ps.stderr.slice(0, 300)}`;
      }
      if (i < 2) await delay(1000 * (1 + i));
    }
    throw new BacklogError('SYNC_FAILED', `the change is committed in ${home} but NOT on origin/main (${err}). It is not recorded until it is `
      + `pushed: fix the cause and run 'git -C ${home} pull --rebase && git -C ${home} push'`, 3);
  }, { takeOver: true });
}
