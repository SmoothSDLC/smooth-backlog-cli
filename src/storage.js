import { promises as fs } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { operation, BacklogError } from './errors.js';
import { validateStore } from './schema.js';
export const exists = async path => { try { await fs.lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export async function safePath(root, target) {
  const rel = relative(resolve(root), resolve(target));
  operation(rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(target).startsWith(`${resolve(root)}${sep}..${sep}`), `Unsafe path: ${target}.`);
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
export async function locked(path, callback) {
  await fs.mkdir(dirname(path), { recursive: true });
  const started = Date.now(); let handle;
  for (;;) {
    try { handle = await fs.open(path, 'wx', 0o600); break; }
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
        try { process.kill(record.pid, 0); } catch (error) {
          if (error.code === 'ESRCH') {
            // Another process may already own this pathname; never unlink a lock based on an old read.
            const current = JSON.parse(await fs.readFile(path, 'utf8'));
            if (current.pid !== record.pid) continue;
            throw new BacklogError('STALE_LOCK', `Lock owner ${record.pid} is no longer running. Verify no backlog process is using this storage, remove ${path}, then rerun; any journal will recover automatically.`, 1);
          }
        }
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        if (error instanceof SyntaxError) {
          let stat; try { stat = await fs.stat(path); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
          if (Date.now() - stat.mtimeMs > 30000) throw new BacklogError('STALE_LOCK', `Incomplete lock ${path}. Verify no backlog process is running, remove this lock, and rerun to recover its journal.`, 1);
        }
        if (!(error instanceof SyntaxError) && !(process.platform === 'win32' && error.code === 'EPERM')) throw error;
      }
      if (Date.now() - started > 10000) throw new BacklogError('LOCKED', `Backlog is locked by another process: ${path}. Retry after it finishes.`, 1);
      await delay(20 + Math.random() * 25);
    }
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid })); return await callback(); }
  finally { await handle.close(); await fs.rm(path, { force: true }); }
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
