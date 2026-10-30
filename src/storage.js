import { promises as fs, closeSync, linkSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { join, relative, resolve, dirname, sep, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { operation, BacklogError } from './errors.js';
import { validateStore } from './schema.js';
export const exists = async path => { try { await fs.lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export async function safePath(root, target) {
  const rel = relative(resolve(root), resolve(target));
  // isAbsolute: on Windows relative() across drives returns the target itself.
  operation(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(target).startsWith(`${resolve(root)}${sep}..${sep}`), `Unsafe path: ${target}.`);
  let current = resolve(root);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    try { operation(!(await fs.lstat(current)).isSymbolicLink(), `Symlink destination is unsupported: ${current}. Resolve it before using backlog.`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function atomicWrite(path, text) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  try { await fs.rename(temp, path); } finally { await fs.rm(temp, { force: true }); }
}
// wait: how long to wait for a holder (ms). takeOver: a lock whose pid is no longer running (on this host) is taken over and said so once,
// instead of refused (shared mode; the local store keeps asking the user to look first).
let tookOver = false;
// item 025: the record names the agent (--by or --agent of the command, else QWEN_CODE_AGENT_ID or the user) and the time
const argOf = flag => { const v = process.argv.find((x, i) => process.argv[i - 1] === flag) ?? process.argv.find(x => x.startsWith(`${flag}=`))?.slice(flag.length + 1); return v && !v.startsWith('--') ? v : ''; };
const lockRecord = () => JSON.stringify({ pid: process.pid, host: hostname(), command: process.argv[2] ?? '', agent: (argOf('--by') || argOf('--agent') || process.env.QWEN_CODE_AGENT_ID || process.env.USER || '').trim(), since: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
// A child that works under its parent's checkout adds itself to the record while it works, and puts the parent's back.
// It registers holding the takeover marker, so a waiter that takes a dead parent's lock over and the child never both
// win: whoever holds the marker second sees the record changed.
export async function asChild(path, fn) {
  let parent;
  try { parent = readFileSync(path, 'utf8'); JSON.parse(parent); } catch { return fn(); } // no record of the parent's to amend
  const put = async text => { const tmp = `${path}.${randomUUID()}.tmp`; try { await fs.writeFile(tmp, text, { mode: 0o600 }); await fs.rename(tmp, path); } finally { await fs.rm(tmp, { force: true }); } };
  const marker = `${path}.takeover`;
  for (let i = 0; ; i++) {
    let fd; try { fd = openSync(marker, 'wx'); } catch (e) { if (e.code !== 'EEXIST' || i > 400) throw e; clearIfGone(marker); await delay(25); continue; }
    try {
      writeSync(fd, `${process.pid}@${hostname()}`);
      if (readFileSync(path, 'utf8') !== parent) throw new BacklogError('LOCKED', `the checkout ${path} of the parent process changed hands before its child started; nothing was changed`, 1);
      await put(JSON.stringify({ ...JSON.parse(parent), child: process.pid }));
      break;
    } finally { closeSync(fd); rmSync(marker, { force: true }); }
  }
  try { return await fn(); } finally { await put(parent); }
}
// The takeover marker names its owner: it is removed only when that process is gone (a stalled owner keeps it), or,
// without a readable owner (an older CLI), when it is older than 30 s.
function clearIfGone(marker) {
  try {
    const seen = readFileSync(marker, 'utf8'); const [pid, host] = seen.split('@');
    const gone = Number(pid) > 0 ? host === hostname() && !alive(Number(pid)) : Date.now() - statSync(marker).mtimeMs > 30000;
    if (gone) clearMarker(marker, seen);
  } catch { /* gone already */ }
}
// Removes a takeover marker whose owner is gone: renamed to a private name first, so a marker another process created
// meanwhile is put back, never removed on an old read.
export function clearMarker(marker, seen) {
  const grab = `${marker}.${process.pid}.${randomUUID()}`;
  try { renameSync(marker, grab); } catch { return; } // gone already
  let same = false; try { same = readFileSync(grab, 'utf8') === seen; } catch { /* unreadable: not the one read */ }
  if (!same) { try { linkSync(grab, marker); } catch { /* a newer one is there */ } }
  rmSync(grab, { force: true });
}
// The lock file appears with its whole record or not at all (a temp file linked, or renamed over a dead holder's), so a
// crash never leaves an empty lock behind.
async function placeLock(path, replace) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, lockRecord(), { mode: 0o600, flag: 'wx' });
    if (replace) await fs.rename(tmp, path); else await fs.link(tmp, path); // link: EEXIST while another holds the name
  } finally { await fs.rm(tmp, { force: true }); }
}
export async function locked(path, callback, { wait = 10000, takeOver = false } = {}) {
  await fs.mkdir(dirname(path), { recursive: true });
  const started = Date.now(); let holder = '';
  // takeOver: only the owner of the takeover marker may replace a dead owner's record, and only if the file is still what
  // was read (a process that created a fresh lock meanwhile is never displaced). A marker is cleared only when its owner is gone (clearIfGone).
  const replaceIf = async (same, why) => {
    const marker = `${path}.takeover`; let fd;
    try { fd = openSync(marker, 'wx'); } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      clearIfGone(marker);
      return false;
    }
    try { writeSync(fd, `${process.pid}@${hostname()}`); } finally { closeSync(fd); }
    try {
      if (!same()) return false;
      await placeLock(path, true);
      if (!tookOver) { tookOver = true; process.stderr.write(`backlog: took over a stale lock ${why}: ${path}\n`); }
      return true;
    } finally { rmSync(marker, { force: true }); }
  };
  for (;;) {
    try { await placeLock(path, false); break; }
    catch (e) {
      // Windows can report EPERM while a previous owner's unlink is still pending.
      if (process.platform === 'win32' && e.code === 'EPERM') {
        if (Date.now() - started > 10000) throw e;
        await delay(20 + Math.random() * 25); continue;
      }
      if (e.code !== 'EEXIST') throw e;
      try {
        const record = JSON.parse(await fs.readFile(path, 'utf8'));
        operation(Number.isSafeInteger(record.pid) && record.pid > 0, `Invalid lock ${path}; inspect it before removing it.`);
        holder = ` (${record.agent ? `agent ${record.agent}, ` : ''}pid ${record.pid}${record.host && record.host !== hostname() ? ` on ${record.host}` : ''}${record.command ? `, command ${record.command}` : ''}${record.since ? `, since ${record.since}` : ''})`; // item 025: who holds it and since when
        try { if (!record.host || record.host === hostname()) process.kill(record.pid, 0); } catch (error) { // a pid of another host cannot be probed: it counts as alive
          // a child working under its parent's checkout (pop --claim-now's update) keeps it alive after its parent died
          if (error.code === 'ESRCH' && !(Number(record.child) > 0 && alive(Number(record.child)))) {
            // Another process may already own this pathname; never unlink a lock based on an old read.
            const current = JSON.parse(await fs.readFile(path, 'utf8'));
            if (current.pid !== record.pid) continue;
            if (takeOver) {
              const same = () => { try { const again = JSON.parse(readFileSync(path, 'utf8')); return again.pid === record.pid && again.host === record.host && !(Number(again.child) > 0 && alive(Number(again.child))); } catch { return false; } }; // a child registered meanwhile keeps it
              if (await replaceIf(same, `of process ${record.pid} (no longer running)`)) break; // else another takes it over: wait
            } else
            throw new BacklogError('STALE_LOCK', `Lock owner ${record.pid} is no longer running. Verify no backlog process is using this storage, remove ${path}, then rerun; any journal will recover automatically.`, 1);
          }
        }
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        if (error instanceof SyntaxError) {
          let stat; try { stat = await fs.stat(path); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
          if (Date.now() - stat.mtimeMs > 30000) {
            // an incomplete record (an older CLI that died while it created the lock): taken over like a dead holder's
            const same = () => { try { const st = statSync(path); if (st.mtimeMs !== stat.mtimeMs) return false; JSON.parse(readFileSync(path, 'utf8')); return false; } catch (e) { return e instanceof SyntaxError; } };
            if (takeOver) { if (await replaceIf(same, 'with an incomplete record older than 30 s')) break; } else
            throw new BacklogError('STALE_LOCK', `Incomplete lock ${path}. Verify no backlog process is running, remove this lock, and rerun to recover its journal.`, 1);
          }
        }
        if (!(error instanceof SyntaxError) && !(process.platform === 'win32' && error.code === 'EPERM')) throw error;
      }
      if (Date.now() - started > wait) throw new BacklogError('LOCKED', `Backlog is locked by another process${holder}: ${path}. Retry after it finishes, or raise BACKLOG_LOCK_WAIT_MS.`, 1);
      await delay(20 + Math.random() * 25);
    }
  }
  // removed on check-in; for a process that died, taken over (takeOver) or reported (STALE_LOCK)
  try { return await callback(); }
  finally { await fs.rm(path, { force: true }); }
}
export async function repositoryLocked(root, callback) {
  const filename = '.smooth-backlog-cli.lock';
  const lock = join(root, filename), legacyLock = join(root, filename.replace('smooth-', ''));
  await safePath(root, lock); await safePath(root, legacyLock);
  // Acquire the pre-rename lock first to coordinate with already-published CLIs.
  return locked(legacyLock, () => locked(lock, callback));
}
export const dataFiles = { config: 'config.json', manifest: 'backlog_manifest.json', archive: 'backlog_archive.json' };
export async function readJSON(path) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); }
  catch (e) { throw new BacklogError('INVALID_STORAGE', `Cannot read ${path}: ${e.message}. Resolve missing files, invalid JSON, or merge conflicts; data was not reset.`, 1); }
}
export async function recover(root) {
  const journal = join(root, '.backlog', '.transaction.json');
  await safePath(root, journal);
  if (!await exists(journal)) return;
  const pending = await readJSON(journal); operation(pending.version === 1, 'Unsupported pending transaction.');
  validateStore(pending.store);
  for (const [key, filename] of Object.entries(dataFiles)) { const path = join(root, '.backlog', filename); await safePath(root, path); await atomicWrite(path, JSON.stringify(pending.store[key], null, 2) + '\n'); }
  await fs.rm(journal);
}
export async function withStore(context, callback) {
  return repositoryLocked(context.root, async () => {
    const dir = join(context.root, '.backlog'); await safePath(context.root, dir);
    operation(await exists(dir), 'Backlog is not initialized. Run backlog init.');
    await recover(context.root);
    const store = {};
    for (const [key, filename] of Object.entries(dataFiles)) { await safePath(context.root, join(dir, filename)); store[key] = await readJSON(join(dir, filename)); }
    validateStore(store); process.env.BACKLOG_CLI_REPONAME = store.config.repo_name;
    const before = JSON.stringify(store); const oldItems = new Map([...store.manifest, ...store.archive].map(x => [x.id, JSON.stringify(x)]));
    const result = await callback(store);
    const now = new Date().toISOString();
    for (const item of [...store.manifest, ...store.archive]) if (oldItems.has(item.id) && oldItems.get(item.id) !== JSON.stringify(item)) item.item_updated_at = now;
    const newest = (a, b) => b.item_created_at.localeCompare(a.item_created_at) || a.id.localeCompare(b.id);
    if (JSON.stringify(store) !== before) {
      store.manifest.sort(newest); store.archive.sort(newest); validateStore(store);
      const journal = join(dir, '.transaction.json'); await safePath(context.root, journal);
      await atomicWrite(journal, JSON.stringify({ version: 1, store })); await recover(context.root);
    }
    return result;
  });
}
