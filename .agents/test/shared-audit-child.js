// Child of the kill -9 test: takes the clone lock, starts an archive-like mutation (file move) and dies right after the move.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as store from '../../src/shared/store.js';
import { itemPath, itemRel, archivedRel, archivedPath } from './shared-fixtures.js';

const [home, folder] = process.argv.slice(2);
await store.cloneLocked(home, async () => {
  await store.undoOnThrow(folder, async () => {
    const src = itemPath(folder, '001-alpha-job'); const to = archivedPath(folder, '001-alpha-job', 'phases');
    store.note(src); store.note(to);
    mkdirSync(join(folder, 'archive', 'phases'), { recursive: true });
    spawnSync('git', ['mv', itemRel('001-alpha-job'), archivedRel('001-alpha-job', 'phases')], { cwd: folder }); // stages the rename
    writeFileSync(to, readFileSync(to, 'utf8').replace(/^status: .*$/m, 'status: "archived"'));
    process.kill(process.pid, 'SIGKILL'); // no catch, no finally
  });
});
