// Child of the kill -9 test: takes the clone lock, starts an archive-like mutation (file move + mirror change) and dies right after the move.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';

const [home, folder] = process.argv.slice(2);
await store.cloneLocked(home, async () => {
  const con = db.connect(folder);
  await db.undoOnThrow(con, folder, async () => {
    const src = join(folder, 'phases', '001-alpha-job.md'); const to = join(folder, 'archive', 'phases', '001-alpha-job.md');
    store.note(src); store.note(to);
    mkdirSync(join(folder, 'archive', 'phases'), { recursive: true });
    spawnSync('git', ['mv', 'phases/001-alpha-job.md', 'archive/phases/001-alpha-job.md'], { cwd: folder }); // stages the rename
    writeFileSync(to, readFileSync(to, 'utf8').replace(/^status: .*$/m, 'status: "archived"'));
    con.prepare("UPDATE phase SET status='archived', path='archive/phases/001-alpha-job.md' WHERE seq=1").run();
    process.kill(process.pid, 'SIGKILL'); // no catch, no finally
  });
});
