// Publication of a team command's own commit, and the re-run when upstream changed what the command read. The command has already
// written its files; publishTeam commits only the paths the command owns (item files, index.json, numbers.json of its folder), publishes only that
// commit (a person's unpushed commit never travels with it) and undoes only what it wrote. It prints nothing and never reads the team file.
// Resolves to { published, result } or to { refusal } (the re-run was refused by the rules: nothing written, nothing persisted).
import { setTimeout as delay } from 'node:timers/promises';
import { sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { locked } from '../storage.js';
import { assertInside } from './safety.js';
import * as store from './store.js';
import { abortPull, commitOnly, commitSubject, keptParts, ownCommit, fail, g, layOver, lit, lockFile, must, ownedPaths, pullArgs, refspec, refuseConflicts, restoreOwn, takeStart, target } from './sync.js';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const zs = r => r.stdout.split('\0').filter(Boolean);
const bare = l => l.slice(':(literal)'.length);
const keep = message => Object.assign(new BacklogError('SYNC_FAILED', message, 3), { keep: true }); // the commit stays on purpose

// watch: repository-relative paths the command read (its folder, the team file when it lies in the clone). attempt(): the whole command again on the
// pulled files, resolving to { message?, ... } or { refusal }. persist(): once, after the last successful publication. exit: 1 for pop.
export async function publishTeam(backlogHome, folder, message, { step, attempt, watch = [], persist = () => {}, exit = 3, now = Date.now, sleep = delay } = {}) {
  const t = await target(backlogHome);
  const home = t.root;
  const name = t.prefix + (await assertInside(backlogHome, folder)).split(sep).join('/');
  const names = [name]; const files = [false];
  const committed = new Set(); // every path any staging of this command took
  const saved = takeStart(home); // the person's files as they were when the command started (none when the command ran no pull)
  let inside = false;
  return locked(lockFile(backlogHome), async () => {
    inside = true;
    const started = now(); const budget = store.lockWait() / 2;
    let mine = false; // the command's own commit is HEAD
    let subject = ''; // its subject
    const own = () => ownCommit(home, subject, committed); // false when a person's commit lies on top of it
    // a person's commit on top: nothing is taken back or published; the text names the command's commit and the two ways out
    const keptError = async cause => { const { state, advice } = await keptParts(home, t, subject, committed); return keep(`${cause}. The change was not published; ${state}. To finish, ${advice}`); };
    const sha = async rev => (await g(home, ['rev-parse', '--verify', '-q', rev])).stdout.trim();
    const fetch = () => g(home, ['fetch', '-q', 'origin', refspec(t)]);

    const commitOwn = async text => {
      await refuseConflicts(home, t);
      const { lits, adds } = await ownedPaths(home, t, names, files);
      for (const l of lits) committed.add(bare(l));
      if (adds.length) await must(home, ['add', '-A', '--', ...adds], `stage ${name}`);
      if (lits.length && (await g(home, ['diff', '--cached', '--quiet', '--', ...lits])).code) {
        subject = commitSubject(t, names, text);
        const c = await commitOnly(home, lits, ['-m', subject]);
        if (c.code) throw new BacklogError('SYNC_FAILED', `could not commit in ${home} (${c.stderr.slice(0, 300)}); the change is not recorded`, 3);
        mine = true;
      }
    };

    // Only the command's own paths go back (to HEAD, or to the bytes the person had); every other path, a lead's uncommitted team file included, is untouched.
    // Resolves to the paths whose person's edit conflicts with the upstream version and was set aside in the stash.
    const undo = async () => {
      if (mine) { // the command's commit may be the first of the branch: then the branch goes back to no commit
        if (await sha('HEAD~1')) await must(home, ['reset', '-q', '--soft', 'HEAD~1'], 'take back the unpublished change');
        else await must(home, ['update-ref', '-d', 'HEAD'], 'take back the unpublished change');
      }
      mine = false;
      const { wrote, moved } = await restoreOwn(home, t, names, files, committed, saved, true);
      const staged = wrote.filter(p => saved.staged.includes(p)); // a person's staging of such a path
      if (staged.length) await must(home, ['restore', '-q', '--staged', `--source=${saved.index}`, '--', ...staged.map(lit)], 'restore your staging');
      const kept = [];
      for (const p of moved) if (!await layOver(home, saved, p)) kept.push(p); // upstream changed the path meanwhile: the person's edit is laid over its version
      return kept;
    };

    // Upstream changed what the command read: drop the own commit, pull, run the command again, commit what it wrote.
    const rerun = async () => {
      if (!await own()) throw await keptError('your own commit lies on top of the command\'s commit, so the step was not run again');
      const wrote = zs(await g(home, ['diff', '--name-only', '-z', '--no-renames', 'HEAD~1', 'HEAD']));
      const old = await sha('HEAD');
      const r = await g(home, ['reset', '--keep', 'HEAD~1']);
      if (r.code) {
        const dirty = new Set([...zs(await g(home, ['diff', '--name-only', '-z', '--no-renames', 'HEAD'])), ...zs(await g(home, ['ls-files', '--others', '--exclude-standard', '-z']))]);
        throw keep(`your uncommitted change to ${wrote.find(p => dirty.has(p)) ?? wrote[0]} blocks the re-run of ${step}; commit or stash it and run the step again`);
      }
      mine = false;
      const pr = await g(home, pullArgs(t));
      if (pr.code) { // the command's commit comes back, the common undo then takes it back
        await abortPull(home);
        await must(home, ['reset', '--keep', old], 'put the unpublished change back');
        mine = true;
        throw new BacklogError('SYNC_FAILED', `could not update ${home} from ${t.ref} (${pr.stderr.slice(0, 300)}); nothing was read or changed`, 3);
      }
      await refuseConflicts(home, t);
      const result = await attempt();
      if (!result.refusal) await commitOwn(result.message ?? message);
      return result;
    };

    // The own commit's change built on upstream, without touching the working tree; resolves to the commit to push.
    const onUpstream = async up => {
      const base = await sha('HEAD~1') || EMPTY_TREE; // the command's commit may be the first of the branch
      const m = await g(home, ['merge-tree', '--write-tree', '-z', '--name-only', '--merge-base', base, up, 'HEAD']); // -z: a path is never quoted
      if (m.code === 1) throw keep(`your unpushed commits change ${m.stdout.split('\0')[1]}; push or drop them and run the step again`);
      if (m.code) throw fail(home, 'build the change on upstream', m);
      return (await must(home, ['commit-tree', m.stdout.split('\0')[0].trim(), '-p', up, '-m', (await g(home, ['log', '-1', '--format=%B', 'HEAD'])).stdout.trim()], 'build the change on upstream')).stdout.trim();
    };

    try {
      await commitOwn(message);
      // persist() also when nothing changed: the command succeeded, and it read the team file whose SHA is recorded
      if (!mine || !t.push) { persist(); return { published: false }; } // nothing changed, or pushing is off: the commit stays
      if (t.remote === false) throw keep(`The change was not published from ${home} (no origin remote); it is committed on this branch: add the origin and push, then continue`);
      let result;
      for (let round = 0; ; round++) {
        if (round) {
          await sleep(Math.random() * Math.min(3200, 50 * 2 ** round));
          if (now() - started >= budget) throw new BacklogError('SYNC_FAILED', `${name.slice(t.prefix.length)} kept changing while ${step} ran; run it again`, exit);
        }
        await fetch();
        if (!await own()) throw await keptError('your own commit lies on top of the command\'s commit');
        if (await sha(t.ref) && Number((await g(home, ['rev-list', '--count', `HEAD..${t.ref}`])).stdout.trim()) > 0
          && watch.length && await sha('HEAD~1') && zs(await g(home, ['diff', '--name-only', '-z', '--no-renames', `HEAD...${t.ref}`, '--', ...watch.map(lit)])).length) {
          result = await rerun();
          if (result.refusal) return result;
          if (!mine) { persist(); return { published: false, result }; }
        }
        const up = await sha(t.ref); // '' when the origin has no such branch yet: the first push creates it
        // the own commit sits right on upstream: a person's unpushed commit below it would travel with it; with no such branch yet, only when no commit below is unpublished
        if (!up && (await g(home, ['rev-list', 'HEAD~1', '--not', '--remotes'])).stdout.trim()) throw keep(`${t.branch} is not on the origin yet and your unpushed commits would travel with the change: publish ${t.branch} first (git push origin ${t.branch}), then run the step again`);
        const direct = !up || await sha('HEAD~1') === up;
        const ps = await g(home, ['push', '-q', 'origin', `${direct ? 'HEAD' : await onUpstream(up)}:refs/heads/${t.branch}`]);
        if (ps.code === 0) {
          if (!direct) { // the local commit, the same patch, drops out; a person's commits stay local on top
            await fetch();
            if ((await g(home, ['rebase', '--autostash', t.ref])).code) { await g(home, ['rebase', '--abort']); persist(); throw keep('the change is published; your local branch could not be rebased onto it: run git pull --rebase'); }
            mine = false;
          }
          persist();
          return { published: true, result };
        }
        await fetch();
        if (await sha(t.ref) === up) throw new BacklogError('SYNC_FAILED', `The change was not published in ${home} (push failed: ${ps.stderr.slice(0, 300)}); the local branch and working tree were rolled back. Fix the cause and retry the command`, 3); // upstream did not move: not a race
      }
    } catch (e) {
      if (!e.keep && mine && !await own()) { // a person's commit on top: nothing is taken back
        const k = await keptError(e.message.replace(/[;,]? the local branch and working tree were rolled back.*$/s, ''));
        k.exitCode = exit;
        throw k;
      }
      if (!e.keep) {
        const kept = await undo();
        if (kept.length) e.message += `; your edit of ${kept.join(', ')} conflicts with the upstream change and is kept in the stash (git -C ${home} stash list), the file itself is the upstream version`;
      }
      if (e.code === 'SYNC_FAILED') e.exitCode = exit; // every failure of the publication: pop reads exit 3 as idle, so it passes 1
      throw e;
    }
  }, { wait: store.lockWait(), takeOver: true }).catch(async e => { // locked out of the lock: the command's own files are taken back (the run lock is still held)
    if (!inside && e.code === 'LOCKED') await restoreOwn(home, t, names, files, new Set(), saved, true);
    throw e;
  }).finally(() => store.forgetWritten(home));
}
