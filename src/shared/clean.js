// `backlog init clean`: after a typed confirmation, removes every item of this repository's backlog (archive included) as one published
// change, then runs setup (configuration and skill copies). The removed items stay in the backlog repository's history.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { assertInside, redact } from './safety.js';
import * as index from './index.js';
import * as setup from './setup.js';
import * as store from './store.js';
import * as sync from './sync.js';

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };

// The first line of standard input; '' at once when there is none (no terminal, no answer).
async function answer(prompt) {
  process.stderr.write(prompt);
  const rl = createInterface({ input: process.stdin, terminal: false });
  try { for await (const line of rl) return line.trim(); return ''; } finally { rl.close(); }
}

export async function run() {
  const cwd = process.cwd();
  const { home, ask } = store.resolveHome();
  if (ask) return die(ask.text, ask.code);
  const repo = store.repoId(cwd);
  const folder = store.folder(home, repo);
  const branch = store.branch(cwd);
  if (await answer(`This will destroy all configuration and current backlog items for ${repo} / ${branch}. Type yes to continue: `) !== 'yes') return die('not confirmed (type yes); nothing changed');
  const removed = await store.cloneLocked(home, async () => {
    await sync.pull(home);
    await assertInside(home, folder);
    const items = store.load(folder);
    if (!items.length) return 0;
    await store.undoOnThrow(folder, async () => {
      for (const { path } of items) { store.note(join(folder, path)); rmSync(join(folder, path)); }
      index.write(folder, { branches: {} });
    });
    await sync.commitSettled(home, folder, 'init clean');
    return items.length;
  });
  const code = await setup.run([]); // the configuration and the skill copies
  if (code) return code;
  process.stdout.write(`✅ ${removed} items removed; the backlog of this repository is empty\n`);
  return 0;
}
