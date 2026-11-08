// `backlog clean [all-branches]` (and its first-release spelling `init clean`): after a typed confirmation, removes every item of the current branch (archive included), or with
// the subcommand all-branches of every branch of the repository, as one published change, then runs setup (configuration and skill copies). The removed
// items stay in the backlog repository's history.
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

export const run = args => clean(args, 'clean'); // the router's command
// `name` is the spelling the caller typed: it is in the refusal and in the commit message of the removal.
export async function clean(args = [], name = 'clean') {
  const every = args[0] === 'all-branches';
  if (args.length > (every ? 1 : 0)) return die(`unrecognized arguments: ${args.join(' ')} (usage: ${name} [all-branches])`);
  const cwd = process.cwd();
  const { home, ask } = store.resolveHome();
  if (ask) return die(ask.text, ask.code);
  const repo = store.repoId(cwd);
  const folder = store.folder(home, repo);
  const branch = store.branch(cwd);
  const scope = every ? `${repo}, every branch` : `${repo}, branch ${branch}`;
  if (await answer(`This will remove every backlog item of ${scope} (archive included) and run setup again. Type yes to continue: `) !== 'yes') return die('not confirmed (type yes); nothing changed');
  const removed = await store.cloneLocked(home, async () => {
    await sync.pull(home);
    await assertInside(home, folder);
    const items = store.load(folder).filter(i => every || String(i.fm.branch || '') === branch);
    if (!items.length) return 0;
    await store.undoOnThrow(folder, async () => {
      for (const { path } of items) { store.note(join(folder, path)); rmSync(join(folder, path)); }
      const idx = index.read(folder); // the other branches keep their places
      if (every) idx.branches = {}; else delete idx.branches[branch];
      index.write(folder, idx);
    });
    await sync.commitSettled(home, folder, name);
    return items.length;
  });
  const code = await setup.run([]); // the configuration and the skill copies
  if (code) return code;
  process.stdout.write(`✅ ${removed} items removed from ${every ? 'every branch' : `branch ${branch}`}\n`);
  return 0;
}
