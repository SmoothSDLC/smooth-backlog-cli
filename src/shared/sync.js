// Git sync of the shared backlog repository (cli-parity job 8). Oracle: lib_db.py:101-110
// (pull before reading or writing) and 275-309 (commit and push after every change), the
// pinned ec5b254e. Node has no flock, so the lock is a pid file (locked() of src/storage.js)
// and a number two clones picked at once is repaired after the rebase (renumber below).
// A failure to sync throws BacklogError with exitCode 3; the caller prints it and exits.
import { setTimeout as delay } from 'node:timers/promises';
import { join, posix, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { locked } from '../storage.js';
import { assertInside, git as run, redact } from './safety.js';
import * as store from './store.js';

const PULL = ['pull', '-q', '--rebase', '--autostash'];
const pad = n => String(n).padStart(3, '0');
const lockFile = home => join(home, '.git', 'smooth-backlog-cli.lock');

// git in the backlog clone; an index.lock held by a git run outside the CLI is retried 5 times
// (lib_db.py:287-294). Everything git says goes through redact: a URL may carry a token.
async function g(home, args) {
  let r;
  for (let i = 0; i < 5; i++) {
    if (i) await delay(500 * i);
    r = await run(args, home);
    if (r.code === 0 || !r.stderr.includes('index.lock')) break;
  }
  return { ...r, stderr: redact(r.stderr).trim() };
}

async function pullLocked(home) {
  const r = await g(home, PULL);
  if (!r.code) return;
  await g(home, ['rebase', '--abort']);
  throw new BacklogError('SYNC_FAILED', `could not update ${home} from origin/main (${r.stderr.slice(0, 300)}); nothing was read or changed, `
    + 'because the local copy may be stale. Fix the cause, then run the command again', 3); // lib_db.py:106-109
}

export const pull = home => locked(lockFile(home), () => pullLocked(home));

// Files this branch added to <name>/phases or <name>/archive since origin, renumbered when their
// seq is already held by another file of the folder: git mv, phase/seq keys, body heading, amend.
async function renumber(home, folder, name) {
  const out = [];
  const added = (await g(home, ['diff', '-z', '--no-renames', '--name-only', '--diff-filter=A', '@{u}', 'HEAD', '--', `${name}/phases`, `${name}/archive`]))
    .stdout.split('\0').filter(f => f.endsWith('.md')).map(f => f.slice(name.length + 1));
  for (const path of added) {
    const items = store.load(folder);
    const mine = items.find(i => i.path === path);
    if (!mine || !items.some(i => i !== mine && Number(i.fm.seq) === Number(mine.fm.seq))) continue;
    const old = Number(mine.fm.seq); const next = store.nextSeq(folder);
    const target = posix.join(posix.dirname(path), pad(next) + posix.basename(path).replace(/^\d+/, ''));
    await g(home, ['mv', `${name}/${path}`, `${name}/${target}`]);
    mine.fm.seq = next;
    if (mine.fm.phase) mine.fm.phase = pad(next) + String(mine.fm.phase).replace(/^\d+/, '');
    store.write({ path: join(folder, target), fm: mine.fm, body: mine.body.replace(/^# Phase \d+/m, `# Phase ${pad(next)}`) });
    await g(home, ['add', '--', `${name}/${target}`]);
    const r = await g(home, ['commit', '-q', '--amend', '--no-edit']);
    if (r.code) throw new BacklogError('SYNC_FAILED', `could not renumber ${path} to ${pad(next)} in ${home} (${r.stderr.slice(0, 300)})`, 3);
    process.stdout.write(`renumbered ${pad(old)} -> ${pad(next)}\n`);
    out.push([old, next]);
  }
  return out;
}

// Commits the folder's changes as "<owner>/<name>: <message>" and pushes them; resolves to the
// [old, new] pairs renumbered on the way. Recorded only when on origin/main (lib_db.py:275-309).
export async function commit(home, folder, message) {
  const name = (await assertInside(home, folder)).split(sep).join('/');
  return locked(lockFile(home), async () => {
    await g(home, ['add', '-A', '--', name]);
    if ((await g(home, ['diff', '--cached', '--quiet'])).code) {
      const c = await g(home, ['commit', '-q', '-m', `${name}: ${message}`]);
      if (c.code) throw new BacklogError('SYNC_FAILED', `could not commit in ${home} (${c.stderr.slice(0, 300)}); the change is not recorded`, 3);
    }
    const renumbered = []; let err = '';
    for (let i = 0; i < 3; i++) {
      const pr = await g(home, PULL);
      if (pr.code) {
        await g(home, ['rebase', '--abort']);
        err = `pull --rebase failed: ${pr.stderr.slice(0, 300)}`;
      } else {
        renumbered.push(...await renumber(home, folder, name));
        const ps = await g(home, ['push', '-q']);
        if (!ps.code) return renumbered;
        err = `push failed: ${ps.stderr.slice(0, 300)}`;
      }
      if (i < 2) await delay(1000 * (1 + i));
    }
    throw new BacklogError('SYNC_FAILED', `the change is committed in ${home} but NOT on origin/main (${err}). It is not recorded until it is `
      + `pushed: fix the cause and run 'git -C ${home} pull --rebase && git -C ${home} push'`, 3);
  });
}
